import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, createTRPCRouter, protectedProcedure, teacherProcedure } from "~/server/api/trpc";
import { listTeachersFromGraph } from "~/server/graph/teachers";
import {
  assertSufficientLoanStock,
  getLoanAvailabilityByItemIds,
} from "~/server/api/routers/utils/loan-stock";
import {
  assertStorageRoomAllowed,
  getStorageRoomAccessForUser,
  orderRoomWhereForAccess,
} from "~/server/api/routers/utils/storage-access";
import {
  notifyLoanHandoverConfirmed,
  notifyLoanApproved,
  notifyLoanRejected,
  notifyLoanReturned,
} from "~/server/mail/loan-events";
import { sendLoanReminder } from "~/server/mail/loan-events";

const createLoanInput = z.object({
  teacherExternalId: z.string().min(1).optional(),
  items: z
    .array(
      z.object({
        lendableItemId: z.string().min(1),
        quantity: z.coerce.number().int().positive(),
      }),
    )
    .min(1)
    .max(30),
});

const teacherLoanIdInput = z.object({
  loanId: z.string().min(1),
});

const adminHandoverInput = z.object({
  loanId: z.string().min(1),
  items: z.array(
    z.object({
      loanItemId: z.string().min(1),
      handoverQuantity: z.coerce.number().int().positive(),
      dueAt: z.coerce.date().optional(),
    }),
  ),
});

const adminReturnInput = z.object({
  loanId: z.string().min(1),
  items: z.array(
    z.object({
      loanItemId: z.string().min(1),
      returnQuantity: z.coerce.number().int().positive(),
    }),
  ),
});

const backendListLoansInput = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CLOSED"]).optional(),
  search: z.string().trim().optional(),
  limit: z.number().int().min(1).max(200).default(80),
});

const backendLoanIdInput = z.object({
  loanId: z.string().min(1),
});

const reminderNowInput = z.object({
  loanItemId: z.string().min(1),
});

const listLendableProductsInput = z.object({
  search: z.string().trim().optional(),
  limit: z.number().int().min(1).max(100).default(30),
});

type SessionUser = { role: "ADMIN" | "TEACHER" | "STUDENT"; id: string; azureAdObjectId?: string | null };

function ensureTeacherCanHandleLoan(sessionUser: SessionUser, loan: { teacherUserId: string | null; teacherExternalId: string | null }) {
  if (sessionUser.role === "ADMIN") return;
  const allowed =
    loan.teacherUserId === sessionUser.id ||
    (sessionUser.azureAdObjectId && loan.teacherExternalId && loan.teacherExternalId === sessionUser.azureAdObjectId);
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN" });
}

const resolveStorageRoomForLoanItems = async (
  tx: unknown,
  lendableItemIds: string[],
) => {
  const db = tx as {
    lendableItem: {
      findMany: (args: unknown) => Promise<Array<{ id: string; storageRoomId: string }>>;
    };
  };

  if (lendableItemIds.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Keine Artikel fuer Lagerraumermittlung uebergeben." });
  }

  const items = await db.lendableItem.findMany({
    where: { id: { in: lendableItemIds } },
    select: { id: true, storageRoomId: true },
  });
  if (items.length !== new Set(lendableItemIds).size) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Mindestens ein ausleihbarer Artikel wurde nicht gefunden.",
    });
  }

  const roomIds = new Set(items.map((item) => item.storageRoomId));
  const firstRoomId = items[0]?.storageRoomId;
  if (!firstRoomId || roomIds.size !== 1) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "MIXED_STORAGE_ROOMS" });
  }
  return firstRoomId;
};

export const loanRouter = createTRPCRouter({
  backendOpenCount: adminProcedure.query(async ({ ctx }) => {
    const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);
    const roomWhere = orderRoomWhereForAccess(access);

    const count = await ctx.db.loan.count({
      where: {
        status: { in: ["PENDING", "APPROVED"] },
        ...(roomWhere ?? {}),
      },
    });

    return { count };
  }),

  listLendableProducts: protectedProcedure.input(listLendableProductsInput).query(async ({ ctx, input }) => {
    const search = input.search?.trim();

    const lendableItems = await ctx.db.lendableItem.findMany({
      where: {
        isVisible: true,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: input.limit,
      select: {
        id: true,
        name: true,
        description: true,
        quantityOnHand: true,
        storageRoomId: true,
        images: {
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: { url: true, altText: true },
        },
      },
    });

    const roomGroups = new Map<string, string[]>();
    for (const item of lendableItems) {
      const roomId = item.storageRoomId;
      const list = roomGroups.get(roomId) ?? [];
      list.push(item.id);
      roomGroups.set(roomId, list);
    }

    const availabilityByItemId = new Map<string, number>();
    for (const [roomId, lendableItemIds] of roomGroups.entries()) {
      const availability = await getLoanAvailabilityByItemIds({
        db: ctx.db,
        storageRoomId: roomId,
        lendableItemIds,
      });
      for (const a of availability) {
        availabilityByItemId.set(a.lendableItemId, a.effectiveAvailable);
      }
    }

    const items = lendableItems
      .map((item) => {
        const effectiveAvailable = availabilityByItemId.get(item.id) ?? 0;
        const firstImage = item.images[0] ?? null;
        const normalizedImage =
          firstImage && firstImage.url.startsWith("/data/uploads/lendable-items/")
            ? { ...firstImage, url: `/api/backend/lendable-items/image/${item.id}` }
            : firstImage;
        return {
          id: item.id,
          name: item.name,
          description: item.description,
          quantityOnHand: item.quantityOnHand,
          effectiveAvailable,
          image: normalizedImage,
        };
      })
      .filter((item) => item.effectiveAvailable > 0);

    return items;
  }),

  listMyLoans: protectedProcedure.query(async ({ ctx }) => {
    const loans = await ctx.db.loan.findMany({
      where: { borrowerId: ctx.session.user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        storageRoom: { select: { id: true, name: true } },
        items: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            lendableItemId: true,
            lendableItem: { select: { id: true, name: true } },
            quantityRequested: true,
            quantityApproved: true,
            quantityHandedOver: true,
            quantityReturned: true,
            borrowedAt: true,
            dueAt: true,
          },
        },
      },
    });

    return loans;
  }),

  listPendingLoanRequests: teacherProcedure.query(async ({ ctx }) => {
    const teacherWhere =
      ctx.session.user.role === "ADMIN"
        ? {}
        : {
            OR: [
              { teacherUserId: ctx.session.user.id },
              ...(ctx.session.user.azureAdObjectId
                ? [{ teacherExternalId: ctx.session.user.azureAdObjectId }]
                : []),
            ],
          };

    return ctx.db.loan.findMany({
      where: {
        status: "PENDING",
        ...teacherWhere,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        teacherDisplayName: true,
        teacherEmail: true,
        teacherExternalId: true,
        borrower: { select: { id: true, name: true, email: true } },
        storageRoom: { select: { id: true, name: true } },
        items: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            lendableItemId: true,
            quantityRequested: true,
            lendableItem: { select: { id: true, name: true } },
          },
        },
      },
    });
  }),

  createLoan: protectedProcedure.input(createLoanInput).mutation(async ({ ctx, input }) => {
    const user = ctx.session.user;
    const isStudent = user.role === "STUDENT";

    let selectedTeacher:
      | { externalId: string; displayName: string; email: string }
      | undefined;

    if (isStudent) {
      if (!input.teacherExternalId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "TEACHER_EXTERNAL_ID_REQUIRED",
        });
      }

      const teachers = await listTeachersFromGraph();
      selectedTeacher = teachers.find((t) => t.externalId === input.teacherExternalId);
      if (!selectedTeacher) {
        return { ok: false as const, reason: "INVALID_TEACHER" as const };
      }
    }

    const itemLines = input.items.map((it) => ({
      lendableItemId: it.lendableItemId,
      quantity: it.quantity,
    }));

    return ctx.db.$transaction(async (tx) => {
      const lendableItemIds = itemLines.map((l) => l.lendableItemId);
      const storageRoomId = await resolveStorageRoomForLoanItems(tx, lendableItemIds);

      if (!isStudent) {
        await assertSufficientLoanStock(
          tx,
          storageRoomId,
          itemLines.map((l) => ({
            lendableItemId: l.lendableItemId,
            requiredQuantity: l.quantity,
          })),
        );
      }

      const teacherUser =
        selectedTeacher && isStudent
          ? await tx.user.findUnique({
              where: { azureAdObjectId: selectedTeacher.externalId },
              select: { id: true },
            })
          : null;

      const created = await tx.loan.create({
        data: {
          borrowerId: user.id,
          teacherUserId: teacherUser?.id ?? null,
          teacherExternalId: selectedTeacher?.externalId ?? null,
          teacherDisplayName: selectedTeacher?.displayName ?? null,
          teacherEmail: selectedTeacher?.email ?? null,
          storageRoomId,
          status: isStudent ? "PENDING" : "APPROVED",
          items: {
            create: itemLines.map((line) => ({
              lendableItemId: line.lendableItemId,
              quantityRequested: line.quantity,
              quantityApproved: isStudent ? 0 : line.quantity,
              quantityHandedOver: 0,
              quantityReturned: 0,
            })),
          },
        },
        select: { id: true, status: true },
      });

      return { ok: true as const, loanId: created.id, status: created.status };
    });
  }),

  teacherApproveLoan: teacherProcedure.input(teacherLoanIdInput).mutation(async ({ ctx, input }) => {
    const sessionUser = ctx.session.user as SessionUser;
    const result = await ctx.db.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({
        where: { id: input.loanId },
        select: {
          id: true,
          status: true,
          storageRoomId: true,
          teacherUserId: true,
          teacherExternalId: true,
          teacherDisplayName: true,
          teacherEmail: true,
          borrower: {
            select: { id: true, name: true, email: true },
          },
          items: {
            select: {
              id: true,
              lendableItemId: true,
              quantityRequested: true,
              quantityApproved: true,
              lendableItem: { select: { id: true, name: true } },
            },
          },
        },
      });

      if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Ausleihanfrage wurde nicht gefunden." });
      ensureTeacherCanHandleLoan(sessionUser, loan);
      if (loan.status !== "PENDING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Diese Ausleiheanfrage wurde bereits bearbeitet.",
        });
      }
      if (loan.items.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Anfrage hat keine Positionen." });
      }

      await assertSufficientLoanStock(
        tx,
        loan.storageRoomId,
        loan.items.map((item) => ({
          lendableItemId: item.lendableItemId,
          requiredQuantity: Number(item.quantityRequested),
        })),
      );

      await Promise.all(
        loan.items.map((item) =>
          tx.loanItem.update({
            where: { id: item.id },
            data: { quantityApproved: item.quantityRequested },
          }),
        ),
      );

      await tx.loan.update({
        where: { id: loan.id },
        data: { status: "APPROVED" },
      });

      return {
        ok: true as const,
        loanId: loan.id,
        borrower: loan.borrower,
        teacher: {
          name: loan.teacherDisplayName,
          email: loan.teacherEmail,
        },
        itemsForMail: loan.items.map((item) => ({
          name: item.lendableItem.name,
          quantity: item.quantityRequested,
        })),
      };
    });

    if (result.ok) {
      notifyLoanApproved({
        borrower: result.borrower,
        teacher: result.teacher,
        loanId: result.loanId,
        items: result.itemsForMail,
      }).catch((error) => {
        console.error("[mail.notifyLoanApproved] loan approval notification failed", error);
      });
    }

    return result;
  }),

  teacherRejectLoan: teacherProcedure.input(teacherLoanIdInput).mutation(async ({ ctx, input }) => {
    const result = await ctx.db.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({
        where: { id: input.loanId },
        select: {
          id: true,
          status: true,
          teacherUserId: true,
          teacherExternalId: true,
          storageRoomId: true,
          teacherDisplayName: true,
          teacherEmail: true,
          borrower: { select: { id: true, name: true, email: true } },
        },
      });

      if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Ausleihanfrage wurde nicht gefunden." });
      ensureTeacherCanHandleLoan(ctx.session.user as SessionUser, loan);

      if (loan.status !== "PENDING") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Diese Ausleiheanfrage wurde bereits bearbeitet." });
      }

      await tx.loan.update({
        where: { id: loan.id },
        data: { status: "REJECTED" },
      });

      return {
        ok: true as const,
        loanId: loan.id,
        borrower: loan.borrower,
        teacher: { name: loan.teacherDisplayName, email: loan.teacherEmail },
      };
    });

    if (result.ok) {
      notifyLoanRejected({
        borrower: result.borrower,
        teacher: result.teacher,
        loanId: result.loanId,
      }).catch((error) => {
        console.error("[mail.notifyLoanRejected] loan rejection notification failed", error);
      });
    }

    return result;
  }),

  backendListLoans: adminProcedure.input(backendListLoansInput).query(async ({ ctx, input }) => {
    const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);
    const roomWhere = orderRoomWhereForAccess(access);
    const search = input.search?.trim();

    return ctx.db.loan.findMany({
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(roomWhere ?? {}),
        ...(search
          ? {
              OR: [
                { borrower: { name: { contains: search, mode: "insensitive" } } },
                { borrower: { email: { contains: search, mode: "insensitive" } } },
                { items: { some: { lendableItem: { name: { contains: search, mode: "insensitive" } } } } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit,
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        storageRoom: { select: { id: true, name: true } },
        borrower: { select: { id: true, name: true, email: true } },
        items: {
          select: {
            id: true,
            lendableItem: { select: { id: true, name: true } },
            quantityApproved: true,
            quantityHandedOver: true,
            quantityReturned: true,
            dueAt: true,
          },
        },
      },
    });
  }),

  backendById: adminProcedure.input(backendLoanIdInput).query(async ({ ctx, input }) => {
    const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);
    const roomWhere = orderRoomWhereForAccess(access);

    const loan = await ctx.db.loan.findFirst({
      where: {
        id: input.loanId,
        ...(roomWhere ?? {}),
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        storageRoomId: true,
        storageRoom: { select: { id: true, name: true } },
        borrower: { select: { id: true, name: true, email: true } },
        items: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            lendableItemId: true,
            quantityRequested: true,
            quantityApproved: true,
            quantityHandedOver: true,
            quantityReturned: true,
            borrowedAt: true,
            dueAt: true,
            lendableItem: {
              select: {
                id: true,
                name: true,
                images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true, altText: true } },
              },
            },
          },
        },
      },
    });

    if (!loan) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Wurde nicht gefunden." });
    }

    return loan;
  }),

  backendHandover: adminProcedure.input(adminHandoverInput).mutation(async ({ ctx, input }) => {
    if (ctx.session.user.role !== "ADMIN") throw new TRPCError({ code: "FORBIDDEN" });

    const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);

    const result = await ctx.db.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({
        where: { id: input.loanId },
        select: {
          id: true,
          status: true,
          storageRoomId: true,
          borrower: { select: { id: true, name: true, email: true } },
          items: {
            select: {
              id: true,
              lendableItemId: true,
              quantityApproved: true,
              quantityHandedOver: true,
              borrowedAt: true,
              dueAt: true,
              quantityReturned: true,
              lendableItem: { select: { name: true } },
            },
          },
        },
      });

      if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Wwurde nicht gefunden." });
      if (loan.status !== "APPROVED") throw new TRPCError({ code: "BAD_REQUEST", message: "Ist nicht freigegeben." });
      assertStorageRoomAllowed(access, loan.storageRoomId);

      const now = new Date();
      const dueDefaultDays = 5;

      const updates = input.items.map((entry) => {
        const item = loan.items.find((li) => li.id === entry.loanItemId);
        if (!item) throw new TRPCError({ code: "BAD_REQUEST", message: "Position wurde nicht gefunden." });

        const quantityApproved = Number(item.quantityApproved);
        const quantityHandedOver = Number(item.quantityHandedOver);
        const remainingApproved = quantityApproved - quantityHandedOver;

        if (entry.handoverQuantity > remainingApproved) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Uebergebungsmenge ist zu hoch.",
          });
        }
        if (entry.handoverQuantity <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Ungültige Menge." });

        const nextBorrowedAt = item.borrowedAt ?? (entry.handoverQuantity > 0 ? now : null);
        const nextDueAt =
          item.dueAt ??
          (entry.handoverQuantity > 0
            ? entry.dueAt ?? new Date(now.getTime() + dueDefaultDays * 24 * 60 * 60 * 1000)
            : null);

        return {
          loanItemId: entry.loanItemId,
          handoverQuantity: entry.handoverQuantity,
          dueAt: entry.dueAt ?? nextDueAt,
          borrowedAt: nextBorrowedAt,
          itemName: item.lendableItem.name,
        };
      });

      await Promise.all(
        updates.map((u) =>
          tx.loanItem.update({
            where: { id: u.loanItemId },
            data: {
              quantityHandedOver: { increment: u.handoverQuantity },
              borrowedAt: u.borrowedAt,
              dueAt: u.dueAt,
            },
          }),
        ),
      );

      const itemsForMail = updates.map((u) => ({
        name: u.itemName,
        quantity: u.handoverQuantity,
        dueAt: u.dueAt,
      }));

      return { ok: true as const, loanId: loan.id, borrower: loan.borrower, itemsForMail };
    });

    if (result.ok) {
      notifyLoanHandoverConfirmed({
        borrower: result.borrower,
        loanId: result.loanId,
        items: result.itemsForMail,
      }).catch((error) => {
        console.error("[mail.notifyLoanHandoverConfirmed] handover notification failed", error);
      });
    }

    return result;
  }),

  backendReturn: adminProcedure.input(adminReturnInput).mutation(async ({ ctx, input }) => {
    if (ctx.session.user.role !== "ADMIN") throw new TRPCError({ code: "FORBIDDEN" });

    const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);

    const result = await ctx.db.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({
        where: { id: input.loanId },
        select: {
          id: true,
          status: true,
          storageRoomId: true,
          borrower: { select: { id: true, name: true, email: true } },
          items: {
            select: {
              id: true,
              lendableItemId: true,
              quantityApproved: true,
              quantityHandedOver: true,
              quantityReturned: true,
              lendableItem: { select: { name: true } },
            },
          },
        },
      });

      if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Wurde nicht gefunden." });
      if (loan.status !== "APPROVED") throw new TRPCError({ code: "BAD_REQUEST", message: "Ist nicht freigegeben." });
      assertStorageRoomAllowed(access, loan.storageRoomId);

      const updates = input.items.map((entry) => {
        const item = loan.items.find((li) => li.id === entry.loanItemId);
        if (!item) throw new TRPCError({ code: "BAD_REQUEST", message: "Position wurde nicht gefunden." });

        const quantityHandedOver = Number(item.quantityHandedOver);
        const quantityReturned = Number(item.quantityReturned);
        const remainingToReturn = quantityHandedOver - quantityReturned;
        if (entry.returnQuantity > remainingToReturn) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Rückgabemenge ist zu hoch." });
        }
        if (entry.returnQuantity <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Ungültige Menge." });

        return {
          loanItemId: entry.loanItemId,
          returnQuantity: entry.returnQuantity,
          itemName: item.lendableItem.name,
        };
      });

      await Promise.all(
        updates.map((u) =>
          tx.loanItem.update({
            where: { id: u.loanItemId },
            data: { quantityReturned: { increment: u.returnQuantity } },
          }),
        ),
      );

      const refreshedItems = await tx.loanItem.findMany({
        where: { loanId: loan.id },
        select: { id: true, quantityApproved: true, quantityReturned: true },
      });

      const allReturned = refreshedItems.every((it) => Number(it.quantityReturned) >= Number(it.quantityApproved));
      if (allReturned) {
        await tx.loan.update({ where: { id: loan.id }, data: { status: "CLOSED" } });
      }

      const returnedItemsForMail = updates.map((u) => ({
        name: u.itemName,
        quantity: u.returnQuantity,
      }));

      return {
        ok: true as const,
        loanId: loan.id,
        status: allReturned ? ("CLOSED" as const) : ("APPROVED" as const),
        borrower: loan.borrower,
        returnedItemsForMail,
      };
    });

    if (result.ok) {
      notifyLoanReturned({
        borrower: result.borrower,
        loanId: result.loanId,
        items: result.returnedItemsForMail,
      }).catch((error) => {
        console.error("[mail.notifyLoanReturned] return notification failed", error);
      });
    }

    return result;
  }),

  backendSendReminderNow: adminProcedure.input(reminderNowInput).mutation(async ({ ctx, input }) => {
    const access = await getStorageRoomAccessForUser(ctx.db, ctx.session.user.id);

    const item = await ctx.db.loanItem.findUnique({
      where: { id: input.loanItemId },
      select: {
        id: true,
        quantityHandedOver: true,
        quantityReturned: true,
        borrowedAt: true,
        dueAt: true,
        loan: {
          select: {
            id: true,
            storageRoomId: true,
            status: true,
            borrower: { select: { id: true, name: true, email: true } },
          },
        },
        lendableItem: { select: { id: true, name: true } },
      },
    });

    if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Position wurde nicht gefunden." });
    assertStorageRoomAllowed(access, item.loan.storageRoomId);

    const activeBorrowed = Number(item.quantityHandedOver) - Number(item.quantityReturned);
    if (activeBorrowed <= 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Diese Position wurde nicht verliehen." });
    }
    if (!item.borrowedAt || !item.loan.borrower.email) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Rückfrage nicht moeglich (fehlende Zeit/Email)." });
    }

    const now = new Date();
    const sentForDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const created = await ctx.db.loanReminderLog.createMany({
      data: [{ loanItemId: item.id, trigger: "MANUAL", sentForDate }],
      skipDuplicates: true,
    });

    if (created.count === 0) {
      return { ok: true as const, skipped: true as const, loanId: item.loan.id };
    }

    await sendLoanReminder({
      borrower: { name: item.loan.borrower.name, email: item.loan.borrower.email },
      itemName: item.lendableItem.name,
      borrowedAt: item.borrowedAt,
      dueAt: item.dueAt ?? null,
    });

    return { ok: true as const, skipped: false as const, loanId: item.loan.id };
  }),
});

