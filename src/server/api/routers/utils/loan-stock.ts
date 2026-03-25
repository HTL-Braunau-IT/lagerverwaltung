import { TRPCError } from "@trpc/server";

import { decimalToNumber } from "~/server/api/routers/utils/stock";

export type LoanStockLike = {
  lendableItemId: string;
  requiredQuantity: number;
};

export type LoanAvailability = {
  lendableItemId: string;
  quantityOnHand: number;
  reservedOutstanding: number;
  effectiveAvailable: number;
};

function floorNonNegative(value: number) {
  const floored = Math.floor(value);
  return Number.isFinite(floored) ? Math.max(0, floored) : 0;
}

/**
 * Availability for lending is derived as:
 * `LendableItem.quantityOnHand - sum(LoanItem.quantityApproved - LoanItem.quantityReturned)`
 * across all active loans in the given storage room.
 */
export async function getLoanAvailabilityByItemIds(params: {
  db: unknown;
  storageRoomId: string;
  lendableItemIds: string[];
}): Promise<LoanAvailability[]> {
  const { storageRoomId, lendableItemIds } = params;
  const db = params.db as {
    lendableItem: {
      findMany: (args: unknown) => Promise<
        Array<{ id: string; quantityOnHand: unknown; storageRoomId: string }>
      >;
    };
    loanItem: {
      findMany: (args: unknown) => Promise<Array<{ lendableItemId: string; quantityApproved: unknown; quantityReturned: unknown }>>;
    };
  };

  if (lendableItemIds.length === 0) return [];

  const items = await db.lendableItem.findMany({
    where: { id: { in: lendableItemIds } },
    select: {
      id: true,
      quantityOnHand: true,
      storageRoomId: true,
    },
  });

  const byId = new Map(items.map((item) => [item.id, item] as const));

  if (items.length !== new Set(lendableItemIds).size) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Mindestens ein ausleihbarer Artikel wurde nicht gefunden.",
    });
  }

  const loanItems = await db.loanItem.findMany({
    where: {
      loan: { storageRoomId, status: "APPROVED" },
      lendableItemId: { in: lendableItemIds },
    },
    select: { lendableItemId: true, quantityApproved: true, quantityReturned: true },
  });

  const outstandingByItem = new Map<string, number>();
  for (const li of loanItems) {
    const approved = decimalToNumber(li.quantityApproved);
    const returned = decimalToNumber(li.quantityReturned);
    const outstanding = approved - returned;
    if (outstanding <= 0) continue;
    outstandingByItem.set(li.lendableItemId, (outstandingByItem.get(li.lendableItemId) ?? 0) + outstanding);
  }

  const out: LoanAvailability[] = [];
  for (const lendableItemId of lendableItemIds) {
    const item = byId.get(lendableItemId);
    if (!item) continue;
    const onHand = decimalToNumber(item.quantityOnHand);
    if (item.storageRoomId !== storageRoomId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `LENDABLE_ITEM_STORAGE_ROOM_MISMATCH:${lendableItemId}:${storageRoomId}`,
      });
    }
    const reservedOutstanding = outstandingByItem.get(lendableItemId) ?? 0;
    const effectiveAvailable = onHand - reservedOutstanding;

    out.push({
      lendableItemId,
      quantityOnHand: onHand,
      reservedOutstanding,
      effectiveAvailable,
    });
  }

  return out;
}

export async function assertSufficientLoanStock(
  db: unknown,
  storageRoomId: string,
  requiredItems: LoanStockLike[],
) {
  if (requiredItems.length === 0) return;

  const prismaDb = db as Parameters<typeof getLoanAvailabilityByItemIds>[0]["db"];

  const lendableItemIds = [...new Set(requiredItems.map((it) => it.lendableItemId))];

  const availability = await getLoanAvailabilityByItemIds({
    db: prismaDb,
    storageRoomId,
    lendableItemIds,
  });
  const byItemId = new Map(availability.map((a) => [a.lendableItemId, a] as const));

  for (const required of requiredItems) {
    const item = byItemId.get(required.lendableItemId);
    if (!item) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Mindestens ein ausleihbarer Artikel wurde nicht gefunden.",
      });
    }

    const effective = item.effectiveAvailable;
    if (required.requiredQuantity > effective) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `INSUFFICIENT_LOAN_STOCK:${required.lendableItemId}:${floorNonNegative(effective)}`,
      });
    }
  }
}

