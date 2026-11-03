import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";

const backendListUsersInput = z.object({
  search: z.string().trim().optional(),
  role: z.enum(["ADMIN", "TEACHER"]).optional(),
  limit: z.number().int().min(1).max(300).default(100),
  cursor: z.string().min(1).optional(),
});

const backendUpdateStorageAccessInput = z.object({
  userId: z.string().min(1),
  hasAllStorageRoomAccess: z.boolean(),
  storageRoomIds: z.array(z.string().min(1)).max(500),
});

export const userRouter = createTRPCRouter({
  backendList: adminProcedure.input(backendListUsersInput).query(async ({ ctx, input }) => {
    const search = input.search?.trim();
    const andFilters: Array<Record<string, unknown>> = [
      { role: { in: input.role ? [input.role] : ["ADMIN", "TEACHER"] } },
    ];

    if (search) {
      andFilters.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    const users = await ctx.db.user.findMany({
      where: { AND: andFilters },
      orderBy: [{ name: "asc" }, { email: "asc" }, { id: "asc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        hasAllStorageRoomAccess: true,
        approvalGroup: {
          select: {
            id: true,
            name: true,
          },
        },
        storageRoomAccesses: {
          select: {
            storageRoomId: true,
            storageRoom: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: [{ storageRoom: { name: "asc" } }, { storageRoomId: "asc" }],
        },
      },
    });

    let nextCursor: string | undefined;
    if (users.length > input.limit) {
      const nextItem = users.pop();
      nextCursor = nextItem?.id;
    }

    return { items: users, nextCursor };
  }),

  backendUpdateStorageAccess: adminProcedure
    .input(backendUpdateStorageAccessInput)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.userId },
        select: { id: true },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Benutzer wurde nicht gefunden.",
        });
      }

      const uniqueStorageRoomIds = [...new Set(input.storageRoomIds)];

      if (!input.hasAllStorageRoomAccess && uniqueStorageRoomIds.length > 0) {
        const existingRooms = await ctx.db.storageRoom.findMany({
          where: { id: { in: uniqueStorageRoomIds } },
          select: { id: true },
        });
        if (existingRooms.length !== uniqueStorageRoomIds.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Mindestens ein ausgewählter Lagerraum ist ungültig.",
          });
        }
      }

      await ctx.db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: input.userId },
          data: {
            hasAllStorageRoomAccess: input.hasAllStorageRoomAccess,
          },
          select: { id: true },
        });

        await tx.userStorageRoomAccess.deleteMany({
          where: { userId: input.userId },
        });

        if (!input.hasAllStorageRoomAccess && uniqueStorageRoomIds.length > 0) {
          await tx.userStorageRoomAccess.createMany({
            data: uniqueStorageRoomIds.map((storageRoomId) => ({
              userId: input.userId,
              storageRoomId,
            })),
            skipDuplicates: true,
          });
        }
      });

      return { ok: true as const };
    }),
});
