import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { listTeachersFromGraph } from "~/server/graph/teachers";
import { notifyOrderCreated, notifyStudentRequestCreated } from "~/server/mail/order-events";
import {
  aggregateProductRequirements,
  assertSufficientStock,
  calculatePartListMaxOrderable,
} from "~/server/api/routers/utils/stock";

const sessionInput = z.object({
  sessionId: z.string().min(1).max(128),
});

const submitForTeacherApprovalInput = sessionInput.extend({
  teacherExternalId: z.string().min(1),
});
const addPartListInput = sessionInput.extend({
  partListId: z.string().min(1),
  quantity: z.coerce.number().positive(),
});
const cartItemLineInput = z.object({
  productId: z.string().min(1),
  sourcePartListId: z.string().min(1).nullable().optional(),
});

function formatOrderNumber(year: number, runningNumber: number) {
  return `${year}${runningNumber.toString().padStart(6, "0")}`;
}

function parseInsufficientStockMessage(message: string) {
  if (!message.startsWith("INSUFFICIENT_STOCK:")) return null;
  const [, productId, maxOrderableRaw] = message.split(":");
  return {
    productId: productId ?? "",
    maxOrderable: Number(maxOrderableRaw ?? "0"),
  };
}

export const cartRouter = createTRPCRouter({
  listTeachersForCheckout: protectedProcedure.query(async ({ ctx }) => {
    if (!["STUDENT", "ADMIN"].includes(ctx.session.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    try {
      return await listTeachersFromGraph();
    } catch (error) {
      console.error("[cart.listTeachersForCheckout] graph lookup failed", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "TEACHER_DIRECTORY_UNAVAILABLE",
      });
    }
  }),

  listCostCenters: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.costCenter.findMany({
      orderBy: [{ code: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
      },
    });
  }),

  get: publicProcedure.input(sessionInput).query(async ({ ctx, input }) => {
    const cart = await ctx.db.cart.findUnique({
      where: { sessionId: input.sessionId },
      select: {
        id: true,
        sessionId: true,
        updatedAt: true,
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            productId: true,
            sourcePartListId: true,
            quantity: true,
            sourcePartList: {
              select: {
                id: true,
                name: true,
              },
            },
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                price: true,
                baseUnit: true,
                unitKind: true,
                unitStep: true,
                quantityOnHand: true,
                minimumQuantity: true,
                images: {
                  orderBy: { sortOrder: "asc" },
                  take: 1,
                  select: {
                    id: true,
                    url: true,
                    altText: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return cart;
  }),

  addItem: publicProcedure
    .input(
      sessionInput.extend({
        productId: z.string().min(1),
        quantity: z.number().positive().default(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const quantity = input.quantity.toString();

      return ctx.db.$transaction(async (tx) => {
        const cart = await tx.cart.upsert({
          where: { sessionId: input.sessionId },
          create: { sessionId: input.sessionId },
          update: {},
          select: { id: true, sessionId: true },
        });

        const existingDirectLine = await tx.cartItem.findFirst({
          where: {
            cartId: cart.id,
            productId: input.productId,
            sourcePartListId: null,
          },
          select: { id: true },
        });

        if (existingDirectLine) {
          await tx.cartItem.update({
            where: { id: existingDirectLine.id },
            data: {
              quantity: {
                increment: quantity,
              },
            },
          });
        } else {
          await tx.cartItem.create({
            data: {
              cartId: cart.id,
              productId: input.productId,
              sourcePartListId: null,
              quantity,
            },
          });
        }

        return cart;
      });
    }),

  addPartList: publicProcedure.input(addPartListInput).mutation(async ({ ctx, input }) => {
    const requestedQuantity = Math.floor(input.quantity);
    if (requestedQuantity < 1) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Menge muss mindestens 1 sein." });
    }

    return ctx.db.$transaction(async (tx) => {
      const partList = await tx.partList.findUnique({
        where: { id: input.partListId },
        select: {
          id: true,
          name: true,
          items: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              productId: true,
              quantity: true,
              product: {
                select: {
                  id: true,
                  quantityOnHand: true,
                },
              },
            },
          },
        },
      });

      if (!partList || partList.items.length === 0) {
        return { ok: false as const, reason: "INVALID_PART_LIST" as const };
      }

      const maxOrderable = calculatePartListMaxOrderable(partList.items);
      if (requestedQuantity > maxOrderable) {
        return {
          ok: false as const,
          reason: "INSUFFICIENT_PART_LIST_STOCK" as const,
          maxOrderable,
          partListName: partList.name,
        };
      }

      const cart = await tx.cart.upsert({
        where: { sessionId: input.sessionId },
        create: { sessionId: input.sessionId },
        update: {},
        select: { id: true },
      });

      for (const item of partList.items) {
        const incrementQuantity = (Number(item.quantity) * requestedQuantity).toString();
        await tx.cartItem.upsert({
          where: {
            cartId_productId_sourcePartListId: {
              cartId: cart.id,
              productId: item.productId,
              sourcePartListId: partList.id,
            },
          },
          create: {
            cartId: cart.id,
            productId: item.productId,
            sourcePartListId: partList.id,
            quantity: incrementQuantity,
          },
          update: {
            quantity: {
              increment: incrementQuantity,
            },
          },
        });
      }

      return { ok: true as const };
    });
  }),

  setItemQuantity: publicProcedure
    .input(
      sessionInput.extend({
        line: cartItemLineInput,
        quantity: z.number().nonnegative(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const cart = await ctx.db.cart.findUnique({
        where: { sessionId: input.sessionId },
        select: { id: true },
      });

      if (!cart) return null;

      const lineWhere = {
        cartId: cart.id,
        productId: input.line.productId,
        ...(input.line.sourcePartListId
          ? { sourcePartListId: input.line.sourcePartListId }
          : { sourcePartListId: null }),
      };

      if (input.quantity === 0) {
        await ctx.db.cartItem.deleteMany({
          where: lineWhere,
        });
      } else {
        const existing = await ctx.db.cartItem.findFirst({
          where: lineWhere,
          select: { id: true },
        });
        if (existing) {
          await ctx.db.cartItem.update({
            where: { id: existing.id },
            data: {
              quantity: input.quantity.toString(),
            },
          });
        } else {
          await ctx.db.cartItem.create({
            data: {
              cartId: cart.id,
              productId: input.line.productId,
              sourcePartListId: input.line.sourcePartListId ?? null,
              quantity: input.quantity.toString(),
            },
          });
        }
      }

      return { ok: true };
    }),

  removeItem: publicProcedure
    .input(
      sessionInput.extend({
        line: cartItemLineInput,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const cart = await ctx.db.cart.findUnique({
        where: { sessionId: input.sessionId },
        select: { id: true },
      });

      if (!cart) return { ok: true };

      await ctx.db.cartItem.deleteMany({
        where: {
          cartId: cart.id,
          productId: input.line.productId,
          sourcePartListId: input.line.sourcePartListId ?? null,
        },
      });

      return { ok: true };
    }),

  checkout: protectedProcedure
    .input(
      sessionInput.extend({
        costCenterId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.$transaction(async (tx) => {
        const cart = await tx.cart.findUnique({
          where: { sessionId: input.sessionId },
          select: {
            id: true,
            items: {
              orderBy: { createdAt: "asc" },
              select: {
                productId: true,
                quantity: true,
                product: {
                  select: {
                    name: true,
                    price: true,
                    baseUnit: true,
                  },
                },
              },
            },
          },
        });

        if (!cart || cart.items.length === 0) {
          return { ok: false as const, reason: "EMPTY_CART" as const };
        }

        const costCenter = await tx.costCenter.findUnique({
          where: { id: input.costCenterId },
          select: { id: true },
        });

        if (!costCenter) {
          return { ok: false as const, reason: "INVALID_COST_CENTER" as const };
        }

        try {
          await assertSufficientStock(tx, aggregateProductRequirements(cart.items));
        } catch (error) {
          if (error instanceof TRPCError && error.code === "BAD_REQUEST") {
            const parsed = parseInsufficientStockMessage(error.message);
            if (parsed) {
              return {
                ok: false as const,
                reason: "INSUFFICIENT_STOCK" as const,
                productId: parsed.productId,
                maxOrderable: parsed.maxOrderable,
              };
            }
          }
          throw error;
        }

        const year = new Date().getFullYear();
        const counter = await tx.orderCounter.upsert({
          where: { year },
          create: {
            year,
            lastNumber: 1,
          },
          update: {
            lastNumber: { increment: 1 },
          },
          select: {
            lastNumber: true,
          },
        });

        const orderNumber = formatOrderNumber(year, counter.lastNumber);

        const order = await tx.order.create({
          data: {
            orderNumber,
            userId: ctx.session.user.id,
            costCenterId: input.costCenterId,
            status: "OPEN",
            items: {
              create: cart.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
              })),
            },
          },
          select: {
            id: true,
            orderNumber: true,
            status: true,
          },
        });

        await tx.cartItem.deleteMany({
          where: { cartId: cart.id },
        });

        return {
          ok: true as const,
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          items: cart.items.map((item) => ({
            name: item.product.name,
            quantity: item.quantity,
            unit: item.product.baseUnit,
            price: item.product.price,
          })),
        };
      });

      if (result.ok) {
        notifyOrderCreated({
          orderNumber: result.orderNumber,
          owner: {
            name: ctx.session.user.name,
            email: ctx.session.user.email,
          },
          selfOrderByTeacher: ctx.session.user.role === "TEACHER",
          items: result.items,
        }).catch((error) => {
          console.error("[mail.notifyOrderCreated] checkout notification failed", error);
        });
      }

      return result;
    }),

  submitForTeacherApproval: protectedProcedure
    .input(submitForTeacherApprovalInput)
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.user.role !== "STUDENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      let selectedTeacher:
        | {
            externalId: string;
            displayName: string;
            email: string;
          }
        | undefined;
      try {
        const teachers = await listTeachersFromGraph();
        selectedTeacher = teachers.find(
          (teacher: { externalId: string; displayName: string; email: string }) =>
            teacher.externalId === input.teacherExternalId,
        );
      } catch (error) {
        console.error("[cart.submitForTeacherApproval] graph lookup failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "TEACHER_DIRECTORY_UNAVAILABLE",
        });
      }

      if (!selectedTeacher) {
        return { ok: false as const, reason: "INVALID_TEACHER" as const };
      }

      const result = await ctx.db.$transaction(async (tx) => {
        const cart = await tx.cart.findUnique({
          where: { sessionId: input.sessionId },
          select: {
            id: true,
            items: {
              orderBy: { createdAt: "asc" },
              select: {
                productId: true,
                quantity: true,
                product: {
                  select: {
                    name: true,
                    price: true,
                    baseUnit: true,
                  },
                },
              },
            },
          },
        });

        if (!cart || cart.items.length === 0) {
          return { ok: false as const, reason: "EMPTY_CART" as const };
        }

        try {
          await assertSufficientStock(tx, aggregateProductRequirements(cart.items));
        } catch (error) {
          if (error instanceof TRPCError && error.code === "BAD_REQUEST") {
            const parsed = parseInsufficientStockMessage(error.message);
            if (parsed) {
              return {
                ok: false as const,
                reason: "INSUFFICIENT_STOCK" as const,
                productId: parsed.productId,
                maxOrderable: parsed.maxOrderable,
              };
            }
          }
          throw error;
        }

        const teacherUser = await tx.user.findUnique({
          where: { azureAdObjectId: selectedTeacher.externalId },
          select: { id: true },
        });

        const request = await tx.orderRequest.create({
          data: {
            studentId: ctx.session.user.id,
            teacherUserId: teacherUser?.id ?? null,
            teacherExternalId: selectedTeacher.externalId,
            teacherDisplayName: selectedTeacher.displayName,
            teacherEmail: selectedTeacher.email,
            status: "PENDING",
            items: {
              create: cart.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
              })),
            },
          },
          select: {
            id: true,
          },
        });

        await tx.cartItem.deleteMany({
          where: { cartId: cart.id },
        });

        return {
          ok: true as const,
          requestId: request.id,
          items: cart.items.map((item) => ({
            name: item.product.name,
            quantity: item.quantity,
            unit: item.product.baseUnit,
            price: item.product.price,
          })),
        };
      });

      if (result.ok) {
        notifyStudentRequestCreated({
          requestId: result.requestId,
          teacher: {
            name: selectedTeacher.displayName,
            email: selectedTeacher.email,
          },
          student: {
            name: ctx.session.user.name,
            email: ctx.session.user.email,
          },
          items: result.items,
        }).catch((error) => {
          console.error("[mail.notifyStudentRequestCreated] request notification failed", error);
        });
      }

      return result;
    }),

  listMyOrders: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.order.findMany({
      where: {
        userId: ctx.session.user.id,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        orderNumber: true,
        status: true,
        createdAt: true,
        sourceRequest: {
          select: {
            id: true,
            status: true,
            student: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        costCenter: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            quantity: true,
            product: {
              select: {
                id: true,
                name: true,
                baseUnit: true,
              },
            },
          },
        },
      },
    });
  }),

  listMySubmittedRequests: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.orderRequest.findMany({
      where: {
        studentId: ctx.session.user.id,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        teacherDisplayName: true,
        teacherEmail: true,
        approvedOrder: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            createdAt: true,
          },
        },
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            quantity: true,
            product: {
              select: {
                id: true,
                name: true,
                baseUnit: true,
              },
            },
          },
        },
      },
    });
  }),

  listSavedCarts: protectedProcedure.query(async ({ ctx }) => {
    const savedCarts = await ctx.db.savedCart.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            productId: true,
            quantity: true,
            product: {
              select: {
                id: true,
                name: true,
                price: true,
                baseUnit: true,
              },
            },
          },
        },
      },
    });

    return savedCarts;
  }),

  saveCurrentCart: protectedProcedure
    .input(
      sessionInput.extend({
        name: z.string().trim().min(1).max(80),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const cart = await ctx.db.cart.findUnique({
        where: { sessionId: input.sessionId },
        select: {
          id: true,
          items: {
            orderBy: { createdAt: "asc" },
            select: {
              productId: true,
              quantity: true,
            },
          },
        },
      });

      if (!cart || cart.items.length === 0) {
        return { ok: false as const, reason: "EMPTY_CART" as const };
      }

      const savedCart = await ctx.db.$transaction(async (tx) => {
        const created = await tx.savedCart.create({
          data: {
            userId: ctx.session.user.id,
            name: input.name,
          },
          select: { id: true },
        });

        await tx.savedCartItem.createMany({
          data: cart.items.map((item) => ({
            savedCartId: created.id,
            productId: item.productId,
            quantity: item.quantity,
          })),
        });

        return created;
      });

      return { ok: true as const, savedCartId: savedCart.id };
    }),

  loadSavedCart: protectedProcedure
    .input(
      sessionInput.extend({
        savedCartId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const savedCart = await ctx.db.savedCart.findFirst({
        where: {
          id: input.savedCartId,
          userId: ctx.session.user.id,
        },
        select: {
          id: true,
          items: {
            orderBy: { createdAt: "asc" },
            select: {
              productId: true,
              quantity: true,
            },
          },
        },
      });

      if (!savedCart) {
        return { ok: false as const, reason: "NOT_FOUND" as const };
      }

      await ctx.db.$transaction(async (tx) => {
        const activeCart = await tx.cart.upsert({
          where: { sessionId: input.sessionId },
          create: { sessionId: input.sessionId },
          update: {},
          select: { id: true },
        });

        await tx.cartItem.deleteMany({
          where: { cartId: activeCart.id },
        });

        if (savedCart.items.length > 0) {
          await tx.cartItem.createMany({
            data: savedCart.items.map((item) => ({
              cartId: activeCart.id,
              productId: item.productId,
              quantity: item.quantity,
            })),
          });
        }
      });

      return { ok: true as const };
    }),

  deleteSavedCart: protectedProcedure
    .input(
      z.object({
        savedCartId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.savedCart.deleteMany({
        where: {
          id: input.savedCartId,
          userId: ctx.session.user.id,
        },
      });

      return { ok: true as const };
    }),
});
