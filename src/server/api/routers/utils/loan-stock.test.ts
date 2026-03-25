import { describe, expect, it } from "vitest";

import { TRPCError } from "@trpc/server";

import { assertSufficientLoanStock, getLoanAvailabilityByItemIds } from "./loan-stock";

function makeDb(params: {
  storageRoomId: string;
  lendableItems: Record<string, number>;
  storageRoomByItem?: Record<string, string>;
  loanItems: Array<{ lendableItemId: string; quantityApproved: number; quantityReturned: number }>;
}) {
  const { storageRoomId, lendableItems, storageRoomByItem, loanItems } = params;

  return {
    lendableItem: {
      findMany: async (args: unknown) => {
        const ids = (args as { where: { id: { in: string[] } } }).where.id.in;
        return ids.map((id) => ({
          id,
          quantityOnHand: lendableItems[id] ?? 0,
          storageRoomId: (storageRoomByItem?.[id] ?? storageRoomId) || "",
        }));
      },
    },
    loanItem: {
      findMany: async (args: unknown) => {
        const ids = (args as { where: { lendableItemId: { in: string[] }; loan: { storageRoomId: string } } }).where
          .lendableItemId.in;
        const roomId = (args as { where: { loan: { storageRoomId: string } } }).where.loan.storageRoomId;
        if (roomId !== storageRoomId) return [];

        return loanItems
          .filter((li) => (ids.length ? ids.includes(li.lendableItemId) : true))
          .map((li) => ({
            lendableItemId: li.lendableItemId,
            quantityApproved: li.quantityApproved,
            quantityReturned: li.quantityReturned,
          }));
      },
    },
  };
}

describe("loan-stock availability", () => {
  it("effective availability subtracts outstanding reserved quantities", async () => {
    const storageRoomId = "room-1";
    const lendableItemId = "li1";
    const db = makeDb({
      storageRoomId,
      lendableItems: { [lendableItemId]: 5 },
      loanItems: [{ lendableItemId, quantityApproved: 2, quantityReturned: 0 }],
    });

    const availability = await getLoanAvailabilityByItemIds({
      db,
      storageRoomId,
      lendableItemIds: [lendableItemId],
    });

    expect(availability[0]?.effectiveAvailable).toBe(3);
  });

  it("asserts sufficient loan stock (pass)", async () => {
    const storageRoomId = "room-1";
    const lendableItemId = "li1";
    const db = makeDb({
      storageRoomId,
      lendableItems: { [lendableItemId]: 5 },
      loanItems: [{ lendableItemId, quantityApproved: 2, quantityReturned: 0 }],
    });

    await expect(
      assertSufficientLoanStock(
        db,
        storageRoomId,
        [{ lendableItemId, requiredQuantity: 3 }],
      ),
    ).resolves.toBeUndefined();
  });

  it("asserts sufficient loan stock (fails with correct message)", async () => {
    const storageRoomId = "room-1";
    const lendableItemId = "li1";
    const db = makeDb({
      storageRoomId,
      lendableItems: { [lendableItemId]: 5 },
      loanItems: [{ lendableItemId, quantityApproved: 2, quantityReturned: 0 }],
    });

    await expect(
      assertSufficientLoanStock(
        db,
        storageRoomId,
        [{ lendableItemId, requiredQuantity: 4 }],
      ),
    ).rejects.toMatchObject({
      name: TRPCError.name,
      message: `INSUFFICIENT_LOAN_STOCK:${lendableItemId}:3`,
    });
  });

  it("returned quantity releases outstanding (no reservation counted)", async () => {
    const storageRoomId = "room-1";
    const lendableItemId = "li1";
    const db = makeDb({
      storageRoomId,
      lendableItems: { [lendableItemId]: 2 },
      loanItems: [{ lendableItemId, quantityApproved: 2, quantityReturned: 2 }],
    });

    const availability = await getLoanAvailabilityByItemIds({
      db,
      storageRoomId,
      lendableItemIds: [lendableItemId],
    });

    expect(availability[0]?.effectiveAvailable).toBe(2);
  });
});

