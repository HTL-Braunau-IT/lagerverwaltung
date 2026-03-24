import { cartRouter } from "~/server/api/routers/cart";
import { categoryRouter } from "~/server/api/routers/category";
import { costCenterRouter } from "~/server/api/routers/cost-center";
import { orderRouter } from "~/server/api/routers/order";
import { partsListRouter } from "~/server/api/routers/parts-list";
import { productRouter } from "~/server/api/routers/product";
import { storageLocationRouter } from "~/server/api/routers/storage-location";
import { storageRoomRouter } from "~/server/api/routers/storage-room";
import { userRouter } from "~/server/api/routers/user";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  product: productRouter,
  category: categoryRouter,
  costCenter: costCenterRouter,
  cart: cartRouter,
  order: orderRouter,
  partsList: partsListRouter,
  storageLocation: storageLocationRouter,
  storageRoom: storageRoomRouter,
  user: userRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
