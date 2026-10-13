import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";

import { listTeachersFromGraph } from "~/server/graph/teachers";
import { getAppSettings, type AppSettings } from "~/server/settings";
import {
  resolveApprovalRequirement,
  type AppRole,
  type ApprovalRequirement,
  type ApprovalSnapshot,
} from "~/server/approval/rules";

type Db = Prisma.TransactionClient;

export const RELEASED_APPROVAL_STATUSES = ["NOT_REQUIRED", "APPROVED"] as const;

/** Orders the warehouse may see and work on (no pending/rejected/cancelled approvals). */
export const releasedOrderWhere = {
  approvalStatus: { in: [...RELEASED_APPROVAL_STATUSES] },
} satisfies Prisma.OrderWhereInput;

export function isReleasedApprovalStatus(status: string) {
  return (RELEASED_APPROVAL_STATUSES as readonly string[]).includes(status);
}

export async function loadApproverUserIds(db: Db, settings: AppSettings) {
  const groups = await db.approvalGroup.findMany({
    where: { isActive: true },
    select: { approverId: true, deputyId: true },
  });
  const ids = new Set<string>();
  for (const group of groups) {
    ids.add(group.approverId);
    if (group.deputyId) ids.add(group.deputyId);
  }
  if (settings.approval.fallbackApproverId) ids.add(settings.approval.fallbackApproverId);
  return ids;
}

export async function resolveApprovalForOrderer(
  db: Db,
  orderer: { id: string; role: AppRole },
  total: number,
): Promise<ApprovalRequirement> {
  // Sequential on purpose: `db` may be an interactive transaction.
  const settings = await getAppSettings(db);
  const user = await db.user.findUnique({
    where: { id: orderer.id },
    select: {
      approvalGroup: {
        select: { id: true, isActive: true, approverId: true, deputyId: true, amountLimit: true },
      },
    },
  });
  const approverUserIds = await loadApproverUserIds(db, settings);

  const group = user?.approvalGroup;
  return resolveApprovalRequirement({
    orderer,
    memberGroup: group
      ? { ...group, amountLimit: group.amountLimit === null ? null : Number(group.amountLimit) }
      : null,
    approverUserIds,
    settings: settings.approval,
    orderTotal: total,
  });
}

/**
 * Where-clause for pending approvals the given user may decide, or null when they decide none.
 * Admins see everything; Freigeber/Vertretung see their groups; the fallback approver sees
 * pending orders without group.
 */
export async function pendingApprovalWhereForUser(
  db: Db,
  user: { id: string; role: AppRole },
): Promise<Prisma.OrderWhereInput | null> {
  if (user.role === "ADMIN") return { approvalStatus: "PENDING" };

  const settings = await getAppSettings(db);
  const groups = await db.approvalGroup.findMany({
    where: { OR: [{ approverId: user.id }, { deputyId: user.id }] },
    select: { id: true },
  });

  const or: Prisma.OrderWhereInput[] = [];
  if (groups.length > 0) or.push({ approvalGroupId: { in: groups.map((group) => group.id) } });
  if (settings.approval.fallbackApproverId === user.id) or.push({ approvalGroupId: null });
  if (or.length === 0) return null;

  return { approvalStatus: "PENDING", OR: or };
}

export async function assertCanDecideOrder(
  db: Db,
  user: { id: string; role: AppRole },
  orderId: string,
) {
  const where = await pendingApprovalWhereForUser(db, user);
  if (!where) throw new TRPCError({ code: "FORBIDDEN" });

  const order = await db.order.findFirst({
    where: { AND: [{ id: orderId }, where] },
    select: { id: true },
  });
  if (!order) {
    const exists = await db.order.findUnique({ where: { id: orderId }, select: { approvalStatus: true } });
    if (!exists) throw new TRPCError({ code: "NOT_FOUND", message: "Bestellung wurde nicht gefunden." });
    if (exists.approvalStatus !== "PENDING") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Diese Bestellung wartet nicht mehr auf Freigabe." });
    }
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

/** Users who must be notified about a pending order (Freigeber + Vertretung, or fallback approver). */
export async function loadApproversForOrder(db: Db, approvalGroupId: string | null) {
  const userSelect = { id: true, name: true, email: true } as const;
  if (approvalGroupId) {
    const group = await db.approvalGroup.findUnique({
      where: { id: approvalGroupId },
      select: { approver: { select: userSelect }, deputy: { select: userSelect } },
    });
    if (!group) return [];
    return [group.approver, ...(group.deputy ? [group.deputy] : [])];
  }

  const settings = await getAppSettings(db);
  const fallbackId = settings.approval.fallbackApproverId;
  if (!fallbackId) return [];
  const fallback = await db.user.findUnique({ where: { id: fallbackId }, select: userSelect });
  return fallback ? [fallback] : [];
}

export function buildApprovalSnapshot(input: {
  costCenter: { id: string; code: string; name: string };
  items: Array<{ productId: string; quantity: unknown; product: { name: string; baseUnit: string } }>;
}): ApprovalSnapshot {
  return {
    costCenterId: input.costCenter.id,
    costCenterLabel: input.costCenter.name,
    items: input.items.map((item) => ({
      productId: item.productId,
      name: item.product.name,
      quantity: Number(item.quantity),
      unit: item.product.baseUnit,
    })),
  };
}

export type UserRef = { userId: string } | { externalId: string };

/**
 * Resolves a teacher picked in the admin UI to a local User id. Teachers who never logged in
 * are provisioned from the Entra teacher directory; NextAuth links them on first login by email.
 */
export async function resolveUserRef(db: Db, ref: UserRef): Promise<string> {
  if ("userId" in ref) {
    const user = await db.user.findUnique({ where: { id: ref.userId }, select: { id: true } });
    if (!user) throw new TRPCError({ code: "BAD_REQUEST", message: "Benutzer wurde nicht gefunden." });
    return user.id;
  }

  const byObjectId = await db.user.findUnique({
    where: { azureAdObjectId: ref.externalId },
    select: { id: true },
  });
  if (byObjectId) return byObjectId.id;

  let teachers;
  try {
    teachers = await listTeachersFromGraph();
  } catch (error) {
    console.error("[approval.resolveUserRef] graph lookup failed", error);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Lehrerverzeichnis ist nicht erreichbar." });
  }
  const entry = teachers.find((teacher) => teacher.externalId === ref.externalId);
  if (!entry) throw new TRPCError({ code: "BAD_REQUEST", message: "Lehrperson wurde im Verzeichnis nicht gefunden." });

  const byEmail = await db.user.findFirst({
    where: { email: { equals: entry.email, mode: "insensitive" } },
    select: { id: true, azureAdObjectId: true },
  });
  if (byEmail) {
    if (!byEmail.azureAdObjectId) {
      await db.user.update({ where: { id: byEmail.id }, data: { azureAdObjectId: entry.externalId } });
    }
    return byEmail.id;
  }

  const created = await db.user.create({
    data: {
      name: entry.displayName,
      email: entry.email,
      azureAdObjectId: entry.externalId,
      role: "TEACHER",
    },
    select: { id: true },
  });
  return created.id;
}
