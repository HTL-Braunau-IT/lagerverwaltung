import { TRPCError } from "@trpc/server";

export type StorageRoomAccess = {
  hasAllStorageRoomAccess: boolean;
  allowedStorageRoomIds: string[];
};

export async function getStorageRoomAccessForUser(
  db: {
    user: {
      findUnique: (args: {
        where: { id: string };
        select: {
          hasAllStorageRoomAccess: true;
          storageRoomAccesses: {
            select: {
              storageRoomId: true;
            };
          };
        };
      }) => Promise<
        | {
            hasAllStorageRoomAccess: boolean;
            storageRoomAccesses: Array<{ storageRoomId: string }>;
          }
        | null
      >;
    };
  },
  userId: string,
): Promise<StorageRoomAccess> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      hasAllStorageRoomAccess: true,
      storageRoomAccesses: {
        select: {
          storageRoomId: true,
        },
      },
    },
  });

  if (!user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Benutzer wurde nicht gefunden.",
    });
  }

  return {
    hasAllStorageRoomAccess: user.hasAllStorageRoomAccess,
    allowedStorageRoomIds: user.storageRoomAccesses.map((entry) => entry.storageRoomId),
  };
}

export function toAllowedStorageRoomIdsSet(access: StorageRoomAccess): Set<string> {
  return new Set(access.allowedStorageRoomIds);
}

export function productRoomWhereForAccess(access: StorageRoomAccess): Record<string, unknown> | undefined {
  if (access.hasAllStorageRoomAccess) return undefined;
  if (access.allowedStorageRoomIds.length === 0) {
    return { id: { in: [] as string[] } };
  }
  return {
    storageLocation: {
      storageRoomId: { in: access.allowedStorageRoomIds },
    },
  };
}

export function orderRoomWhereForAccess(access: StorageRoomAccess): Record<string, unknown> | undefined {
  if (access.hasAllStorageRoomAccess) return undefined;
  if (access.allowedStorageRoomIds.length === 0) {
    return { id: { in: [] as string[] } };
  }
  return {
    storageRoomId: { in: access.allowedStorageRoomIds },
  };
}

export function assertStorageRoomAllowed(access: StorageRoomAccess, storageRoomId: string) {
  if (access.hasAllStorageRoomAccess) return;
  if (!access.allowedStorageRoomIds.includes(storageRoomId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Kein Zugriff auf diesen Lagerraum.",
    });
  }
}

export async function assertProductsAccessibleByRoomAccess(
  db: {
    product: {
      findMany: (args: {
        where: { id: { in: string[] } };
        select: {
          id: true;
          storageLocation: {
            select: {
              storageRoomId: true;
            };
          };
        };
      }) => Promise<Array<{ id: string; storageLocation: { storageRoomId: string } | null }>>;
    };
  },
  access: StorageRoomAccess,
  productIds: string[],
) {
  if (access.hasAllStorageRoomAccess) return;
  if (productIds.length === 0) return;

  const allowedIds = toAllowedStorageRoomIdsSet(access);
  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      storageLocation: {
        select: {
          storageRoomId: true,
        },
      },
    },
  });

  if (products.length !== new Set(productIds).size) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Mindestens ein Produkt wurde nicht gefunden.",
    });
  }

  const forbidden = products.find(
    (product) => !product.storageLocation || !allowedIds.has(product.storageLocation.storageRoomId),
  );

  if (forbidden) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Mindestens ein Produkt liegt ausserhalb deiner Lagerraumrechte.",
    });
  }
}

export async function resolveSingleStorageRoomForProductIds(
  db: {
    product: {
      findMany: (args: {
        where: { id: { in: string[] } };
        select: {
          id: true;
          storageLocation: {
            select: {
              storageRoom: {
                select: {
                  id: true;
                  name: true;
                };
              };
            };
          };
        };
      }) => Promise<
        Array<{
          id: string;
          storageLocation: {
            storageRoom: {
              id: string;
              name: string;
            };
          } | null;
        }>
      >;
    };
  },
  productIds: string[],
): Promise<{ id: string; name: string }> {
  if (productIds.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Keine Produkte fuer Lagerraumermittlung uebergeben.",
    });
  }

  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      storageLocation: {
        select: {
          storageRoom: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (products.length !== new Set(productIds).size) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Mindestens ein Produkt wurde nicht gefunden.",
    });
  }

  const roomIds = new Set<string>();
  let firstRoom: { id: string; name: string } | null = null;

  for (const product of products) {
    const room = product.storageLocation?.storageRoom;
    if (!room) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `PRODUCT_WITHOUT_STORAGE_ROOM:${product.id}`,
      });
    }
    roomIds.add(room.id);
    if (!firstRoom) {
      firstRoom = { id: room.id, name: room.name };
    }
  }

  if (roomIds.size !== 1 || !firstRoom) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "MIXED_STORAGE_ROOMS_INTERNAL",
    });
  }

  return firstRoom;
}
