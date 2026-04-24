import { TRPCError } from "@trpc/server";

type StockLike = {
  productId: string;
  requiredQuantity: number;
};

export function decimalToNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return Number(value ?? 0);
}

export function aggregateProductRequirements(items: Array<{ productId: string; quantity: unknown }>): StockLike[] {
  const aggregate = new Map<string, number>();

  for (const item of items) {
    const quantity = decimalToNumber(item.quantity);
    const current = aggregate.get(item.productId) ?? 0;
    aggregate.set(item.productId, current + quantity);
  }

  return [...aggregate.entries()].map(([productId, requiredQuantity]) => ({ productId, requiredQuantity }));
}

export function calculatePartListMaxOrderable(
  items: Array<{ quantity: unknown; product: { quantityOnHand: unknown } }>,
): number {
  if (items.length === 0) return 0;

  let maxOrderable = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const requiredPerList = decimalToNumber(item.quantity);
    const onHand = decimalToNumber(item.product.quantityOnHand);
    if (requiredPerList <= 0) continue;
    maxOrderable = Math.min(maxOrderable, Math.floor(onHand / requiredPerList));
  }

  if (!Number.isFinite(maxOrderable)) return 0;
  return Math.max(0, maxOrderable);
}

export async function assertSufficientStock(
  db: {
    product: {
      findMany: (args: {
        where: { id: { in: string[] } };
        select: { id: true; name: true; quantityOnHand: true };
      }) => Promise<Array<{ id: string; name: string; quantityOnHand: unknown }>>;
    };
  },
  requiredItems: StockLike[],
) {
  if (requiredItems.length === 0) return;

  const products = await db.product.findMany({
    where: { id: { in: requiredItems.map((item) => item.productId) } },
    select: {
      id: true,
      name: true,
      quantityOnHand: true,
    },
  });
  const byId = new Map(products.map((product) => [product.id, product]));

  for (const required of requiredItems) {
    const product = byId.get(required.productId);
    if (!product) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Ein Produkt der Bestellung existiert nicht mehr.",
      });
    }

    const available = decimalToNumber(product.quantityOnHand);
    if (required.requiredQuantity > available) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `INSUFFICIENT_STOCK:${product.id}:${available}`,
      });
    }
  }
}
