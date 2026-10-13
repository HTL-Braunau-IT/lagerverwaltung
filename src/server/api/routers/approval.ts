import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
  teacherProcedure,
} from "~/server/api/trpc";
import { aggregateProductRequirements, assertSufficientStock } from "~/server/api/routers/utils/stock";
import { getQuantityStepForBaseUnit, isQuantityAlignedToStep } from "~/lib/quantity-rules";
import { listTeachersFromGraph } from "~/server/graph/teachers";
import {
  dispatchApprovalCancelled,
  dispatchApprovalDecided,
} from "~/server/approval/notifications";
import {
  describeApprovalChanges,
  orderTotal,
  parseApprovalSnapshot,
} from "~/server/approval/rules";
import {
  assertCanDecideOrder,
  buildApprovalSnapshot,
  loadApproversForOrder,
  pendingApprovalWhereForUser,
  resolveApprovalForOrderer,
  resolveUserRef,
  type UserRef,
} from "~/server/approval/service";
import { appSettingsSchema, getAppSettings, saveAppSettings } from "~/server/settings";

const userRefInput = z.union([
  z.object({ userId: z.string().min(1) }),
  z.object({ externalId: z.string().min(1) }),
]);

const orderIdInput = z.object({ orderId: z.string().min(1) });

const approvalNoteInput = z.string().trim().max(1000);

const groupSaveInput = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120),
  isActive: z.boolean(),
  approver: userRefInput,
  deputy: userRefInput.nullable(),
  amountLimit: z.number().min(0).max(1_000_000).nullable(),
  members: z.array(userRefInput).max(1000),
});

const settingsSaveInput = z.object({
  approval: appSettingsSchema.shape.approval.unwrap().omit({ fallbackApproverId: true }),
  fallbackApprover: userRefInput.nullable(),
  mail: appSettingsSchema.shape.mail.unwrap(),
});

const userSummarySelect = { id: true, name: true, email: true } as const;

const pendingOrderSelect = {
  id: true,
  orderNumber: true,
  workerNote: true,
  createdAt: true,
  approvalStatus: true,
  approvalNote: true,
  approvalDecidedAt: true,
  approvalSnapshot: true,
  user: { select: userSummarySelect },
  approvalDecidedBy: { select: userSummarySelect },
  approvalGroup: { select: { id: true, name: true } },
  sourceRequest: { select: { student: { select: userSummarySelect } } },
  costCenter: { select: { id: true, code: true, name: true } },
  items: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true,
      productId: true,
      quantity: true,
      product: {
        select: { id: true, name: true, sku: true, baseUnit: true, price: true, quantityOnHand: true },
      },
    },
  },
};

function withTotal<T extends { items: Array<{ quantity: unknown; product: { price: unknown } }> }>(order: T) {
  return {
    ...order,
    total: orderTotal(order.items.map((item) => ({ quantity: item.quantity, price: item.product.price }))),
  };
}

async function resolveUserRefs(db: Parameters<typeof resolveUserRef>[0], refs: UserRef[]) {
  const ids: string[] = [];
  for (const ref of refs) {
    ids.push(await resolveUserRef(db, ref));
  }
  return [...new Set(ids)];
}

export const approvalRouter = createTRPCRouter({
  /** Who will approve the current user's orders, for the checkout hint. */
  myInfo: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.session.user.role === "STUDENT") return null;
    const requirement = await resolveApprovalForOrderer(
      ctx.db,
      { id: ctx.session.user.id, role: ctx.session.user.role },
      Number.POSITIVE_INFINITY,
    );
    if (!requirement.required) return null;

    const [approvers, settings, user] = await Promise.all([
      loadApproversForOrder(ctx.db, requirement.approvalGroupId),
      getAppSettings(ctx.db),
      ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { approvalGroup: { select: { amountLimit: true, isActive: true } } },
      }),
    ]);
    const groupLimit = user?.approvalGroup?.isActive ? user.approvalGroup.amountLimit : null;
    const amountLimit =
      groupLimit !== null && groupLimit !== undefined
        ? Number(groupLimit)
        : settings.approval.amountLimitEnabled
          ? settings.approval.amountLimit
          : null;

    return {
      approvers: approvers.map((approver) => approver.name ?? approver.email ?? "-"),
      amountLimit,
    };
  }),

  pendingCount: teacherProcedure.query(async ({ ctx }) => {
    const where = await pendingApprovalWhereForUser(ctx.db, ctx.session.user);
    if (!where) return { count: 0 };
    return { count: await ctx.db.order.count({ where }) };
  }),

  listPending: teacherProcedure.query(async ({ ctx }) => {
    const where = await pendingApprovalWhereForUser(ctx.db, ctx.session.user);
    if (!where) return [];
    const orders = await ctx.db.order.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: pendingOrderSelect,
    });
    return orders.map(withTotal);
  }),

  listDecidedByMe: teacherProcedure.query(async ({ ctx }) => {
    const orders = await ctx.db.order.findMany({
      where: {
        approvalDecidedById: ctx.session.user.id,
        approvalStatus: { in: ["APPROVED", "REJECTED"] },
      },
      orderBy: [{ approvalDecidedAt: "desc" }, { id: "desc" }],
      take: 20,
      select: pendingOrderSelect,
    });
    return orders.map(withTotal);
  }),

  updateItemQuantity: teacherProcedure
    .input(orderIdInput.extend({ itemId: z.string().min(1), quantity: z.coerce.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        await assertCanDecideOrder(tx, ctx.session.user, input.orderId);
        const items = await tx.orderItem.findMany({
          where: { orderId: input.orderId },
          select: { id: true, productId: true, quantity: true, product: { select: { baseUnit: true } } },
        });
        const target = items.find((item) => item.id === input.itemId);
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Position wurde nicht gefunden." });

        const step = getQuantityStepForBaseUnit(target.product.baseUnit);
        if (!isQuantityAlignedToStep(input.quantity, step)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Menge muss zur Mengeneinheit passen." });
        }

        try {
          await assertSufficientStock(
            tx,
            aggregateProductRequirements(
              items.map((item) => ({
                productId: item.productId,
                quantity: item.id === input.itemId ? input.quantity : item.quantity,
              })),
            ),
          );
        } catch (error) {
          if (error instanceof TRPCError && error.message.startsWith("INSUFFICIENT_STOCK:")) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Nicht genug Lagerbestand fuer diese Menge." });
          }
          throw error;
        }

        await tx.orderItem.update({
          where: { id: input.itemId },
          data: { quantity: input.quantity.toString() },
          select: { id: true },
        });
        return { ok: true as const };
      });
    }),

  removeItem: teacherProcedure
    .input(orderIdInput.extend({ itemId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        await assertCanDecideOrder(tx, ctx.session.user, input.orderId);
        const items = await tx.orderItem.findMany({ where: { orderId: input.orderId }, select: { id: true } });
        if (!items.some((item) => item.id === input.itemId)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Position wurde nicht gefunden." });
        }
        if (items.length <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Die letzte Position kann nicht entfernt werden. Bitte Bestellung ablehnen.",
          });
        }
        await tx.orderItem.delete({ where: { id: input.itemId }, select: { id: true } });
        return { ok: true as const };
      });
    }),

  approve: teacherProcedure
    .input(orderIdInput.extend({ costCenterId: z.string().min(1), note: approvalNoteInput.optional() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.$transaction(async (tx) => {
        await assertCanDecideOrder(tx, ctx.session.user, input.orderId);

        const costCenter = await tx.costCenter.findUnique({
          where: { id: input.costCenterId },
          select: { id: true, code: true, name: true, isActive: true },
        });
        if (!costCenter?.isActive) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ungueltige Kostenstelle." });
        }

        const order = await tx.order.findUniqueOrThrow({
          where: { id: input.orderId },
          select: {
            approvalSnapshot: true,
            items: {
              select: { productId: true, quantity: true, product: { select: { name: true, baseUnit: true } } },
            },
          },
        });

        try {
          await assertSufficientStock(tx, aggregateProductRequirements(order.items));
        } catch (error) {
          if (error instanceof TRPCError && error.message.startsWith("INSUFFICIENT_STOCK:")) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Nicht genug Lagerbestand fuer mindestens ein Produkt.",
            });
          }
          throw error;
        }

        await tx.order.update({
          where: { id: input.orderId },
          data: {
            approvalStatus: "APPROVED",
            costCenterId: costCenter.id,
            approvalDecidedById: ctx.session.user.id,
            approvalDecidedAt: new Date(),
            approvalNote: input.note?.trim() || null,
          },
          select: { id: true },
        });

        const changes = describeApprovalChanges(
          parseApprovalSnapshot(order.approvalSnapshot),
          buildApprovalSnapshot({ costCenter, items: order.items }),
        );
        return { ok: true as const, orderId: input.orderId, changes };
      });

      dispatchApprovalDecided(ctx.db, result.orderId, result.changes);
      return result;
    }),

  reject: teacherProcedure
    .input(orderIdInput.extend({ note: approvalNoteInput.min(1, "Bitte eine Begruendung angeben.") }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.$transaction(async (tx) => {
        await assertCanDecideOrder(tx, ctx.session.user, input.orderId);
        await tx.order.update({
          where: { id: input.orderId },
          data: {
            approvalStatus: "REJECTED",
            approvalDecidedById: ctx.session.user.id,
            approvalDecidedAt: new Date(),
            approvalNote: input.note,
          },
          select: { id: true },
        });
      });

      dispatchApprovalDecided(ctx.db, input.orderId, []);
      return { ok: true as const };
    }),

  /** The orderer withdraws their own pending order. */
  cancelMine: protectedProcedure.input(orderIdInput).mutation(async ({ ctx, input }) => {
    const updated = await ctx.db.order.updateMany({
      where: { id: input.orderId, userId: ctx.session.user.id, approvalStatus: "PENDING" },
      data: { approvalStatus: "CANCELLED", approvalDecidedAt: new Date() },
    });
    if (updated.count === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Bestellung kann nicht mehr zurueckgezogen werden.",
      });
    }

    dispatchApprovalCancelled(ctx.db, input.orderId);
    return { ok: true as const };
  }),

  /** Teachers/admins to pick from: Entra teacher directory merged with known local users. */
  directory: adminProcedure.query(async ({ ctx }) => {
    const localUsers = await ctx.db.user.findMany({
      where: { OR: [{ role: { in: ["ADMIN", "TEACHER"] } }, { approvalGroupId: { not: null } }] },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        azureAdObjectId: true,
        approvalGroup: { select: { id: true, name: true } },
      },
    });

    let graphTeachers: Awaited<ReturnType<typeof listTeachersFromGraph>> = [];
    let directoryError = false;
    try {
      graphTeachers = await listTeachersFromGraph();
    } catch (error) {
      console.error("[approval.directory] graph lookup failed", error);
      directoryError = true;
    }

    const byObjectId = new Map(
      localUsers.filter((user) => user.azureAdObjectId).map((user) => [user.azureAdObjectId!, user]),
    );
    const byEmail = new Map(
      localUsers.filter((user) => user.email).map((user) => [user.email!.toLowerCase(), user]),
    );
    const usedUserIds = new Set<string>();

    const entries: Array<{
      key: string;
      ref: UserRef;
      userId: string | null;
      name: string;
      email: string;
      group: { id: string; name: string } | null;
    }> = [];

    for (const teacher of graphTeachers) {
      const local = byObjectId.get(teacher.externalId) ?? byEmail.get(teacher.email.toLowerCase());
      if (local) usedUserIds.add(local.id);
      entries.push({
        key: local ? local.id : `ext:${teacher.externalId}`,
        ref: local ? { userId: local.id } : { externalId: teacher.externalId },
        userId: local?.id ?? null,
        name: local?.name ?? teacher.displayName,
        email: local?.email ?? teacher.email,
        group: local?.approvalGroup ?? null,
      });
    }

    for (const user of localUsers) {
      if (usedUserIds.has(user.id)) continue;
      entries.push({
        key: user.id,
        ref: { userId: user.id },
        userId: user.id,
        name: user.name ?? user.email ?? "-",
        email: user.email ?? "",
        group: user.approvalGroup,
      });
    }

    entries.sort((a, b) => a.name.localeCompare(b.name, "de-AT"));
    return { entries, directoryError };
  }),

  groupList: adminProcedure.query(async ({ ctx }) => {
    const groups = await ctx.db.approvalGroup.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        isActive: true,
        amountLimit: true,
        approver: { select: userSummarySelect },
        deputy: { select: userSummarySelect },
        members: { select: userSummarySelect, orderBy: [{ name: "asc" }, { email: "asc" }] },
        _count: { select: { orders: { where: { approvalStatus: "PENDING" } } } },
      },
    });
    return groups.map((group) => ({
      ...group,
      amountLimit: group.amountLimit === null ? null : Number(group.amountLimit),
      pendingCount: group._count.orders,
    }));
  }),

  groupSave: adminProcedure.input(groupSaveInput).mutation(async ({ ctx, input }) => {
    // Resolve outside the transaction: may call Graph and provision users.
    const approverId = await resolveUserRef(ctx.db, input.approver);
    const deputyId = input.deputy ? await resolveUserRef(ctx.db, input.deputy) : null;
    const memberIds = await resolveUserRefs(ctx.db, input.members);

    if (deputyId && deputyId === approverId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Freigeber und Vertretung muessen verschieden sein." });
    }

    const nameTaken = await ctx.db.approvalGroup.findFirst({
      where: { name: { equals: input.name, mode: "insensitive" }, ...(input.id ? { id: { not: input.id } } : {}) },
      select: { id: true },
    });
    if (nameTaken) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Eine Gruppe mit diesem Namen existiert bereits." });
    }

    const groupId = await ctx.db.$transaction(async (tx) => {
      const data = {
        name: input.name,
        isActive: input.isActive,
        approverId,
        deputyId,
        amountLimit: input.amountLimit === null ? null : input.amountLimit.toFixed(2),
      };
      const group = input.id
        ? await tx.approvalGroup.update({ where: { id: input.id }, data, select: { id: true } })
        : await tx.approvalGroup.create({ data, select: { id: true } });

      await tx.user.updateMany({
        where: { approvalGroupId: group.id, id: { notIn: memberIds } },
        data: { approvalGroupId: null },
      });
      if (memberIds.length > 0) {
        await tx.user.updateMany({ where: { id: { in: memberIds } }, data: { approvalGroupId: group.id } });
      }
      return group.id;
    });

    return { ok: true as const, id: groupId };
  }),

  groupAssignMember: adminProcedure
    .input(z.object({ groupId: z.string().min(1).nullable(), member: userRefInput }))
    .mutation(async ({ ctx, input }) => {
      if (input.groupId) {
        const group = await ctx.db.approvalGroup.findUnique({ where: { id: input.groupId }, select: { id: true } });
        if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Gruppe wurde nicht gefunden." });
      }
      const userId = await resolveUserRef(ctx.db, input.member);
      await ctx.db.user.update({ where: { id: userId }, data: { approvalGroupId: input.groupId } });
      return { ok: true as const };
    }),

  groupDelete: adminProcedure.input(z.object({ id: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const pending = await ctx.db.order.count({ where: { approvalGroupId: input.id, approvalStatus: "PENDING" } });
    if (pending > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Gruppe hat noch offene Freigaben. Bitte zuerst entscheiden oder Gruppe deaktivieren.",
      });
    }
    await ctx.db.approvalGroup.delete({ where: { id: input.id }, select: { id: true } });
    return { ok: true as const };
  }),

  settingsGet: adminProcedure.query(async ({ ctx }) => {
    const settings = await getAppSettings(ctx.db);
    const fallbackApprover = settings.approval.fallbackApproverId
      ? await ctx.db.user.findUnique({
          where: { id: settings.approval.fallbackApproverId },
          select: userSummarySelect,
        })
      : null;
    return { settings, fallbackApprover };
  }),

  settingsSave: adminProcedure.input(settingsSaveInput).mutation(async ({ ctx, input }) => {
    const fallbackApproverId = input.fallbackApprover ? await resolveUserRef(ctx.db, input.fallbackApprover) : null;
    const saved = await saveAppSettings(
      {
        approval: { ...input.approval, fallbackApproverId },
        mail: input.mail,
      },
      ctx.db,
    );
    return { ok: true as const, settings: saved };
  }),
});
