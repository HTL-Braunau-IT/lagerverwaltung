import type { AppSettings } from "~/server/settings";

export type AppRole = "ADMIN" | "TEACHER" | "STUDENT";

export type ApprovalGroupForRules = {
  id: string;
  isActive: boolean;
  approverId: string;
  deputyId: string | null;
  amountLimit: number | null;
};

export type ApprovalNotRequiredReason =
  | "DISABLED"
  | "ADMIN"
  | "IS_APPROVER"
  | "NO_APPROVER"
  | "BELOW_LIMIT";

export type ApprovalRequirement =
  | { required: false; reason: ApprovalNotRequiredReason }
  | { required: true; approvalGroupId: string | null; approverIds: string[] };

/**
 * Decides whether an order placed by `orderer` needs a Freigabe and by whom.
 *
 * - Admins and anyone acting as Freigeber/Vertretung (of any active group) or as fallback
 *   approver order without approval.
 * - Members of an active group are approved by its Freigeber (+ Vertretung).
 * - Teachers without an (active) group go to the fallback approver; without one they order directly.
 * - Orders up to the amount limit (group override, else global setting) need no approval.
 */
export function resolveApprovalRequirement(input: {
  orderer: { id: string; role: AppRole };
  memberGroup: ApprovalGroupForRules | null;
  approverUserIds: ReadonlySet<string>;
  settings: AppSettings["approval"];
  orderTotal: number;
}): ApprovalRequirement {
  const { orderer, settings } = input;

  if (!settings.enabled) return { required: false, reason: "DISABLED" };
  if (orderer.role === "ADMIN") return { required: false, reason: "ADMIN" };
  if (input.approverUserIds.has(orderer.id) || settings.fallbackApproverId === orderer.id) {
    return { required: false, reason: "IS_APPROVER" };
  }

  const group = input.memberGroup?.isActive ? input.memberGroup : null;
  const approverIds = group
    ? [group.approverId, group.deputyId].filter((id): id is string => Boolean(id))
    : settings.fallbackApproverId
      ? [settings.fallbackApproverId]
      : [];

  if (approverIds.length === 0) return { required: false, reason: "NO_APPROVER" };

  const limit = group?.amountLimit ?? (settings.amountLimitEnabled ? settings.amountLimit : null);
  if (limit !== null && input.orderTotal <= limit) {
    return { required: false, reason: "BELOW_LIMIT" };
  }

  return { required: true, approvalGroupId: group?.id ?? null, approverIds };
}

export type ApprovalSnapshot = {
  costCenterId: string;
  costCenterLabel: string;
  items: Array<{ productId: string; name: string; quantity: number; unit: string }>;
};

export function parseApprovalSnapshot(value: unknown): ApprovalSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ApprovalSnapshot>;
  if (typeof raw.costCenterId !== "string" || !Array.isArray(raw.items)) return null;
  return {
    costCenterId: raw.costCenterId,
    costCenterLabel: typeof raw.costCenterLabel === "string" ? raw.costCenterLabel : "",
    items: raw.items.filter(
      (item): item is ApprovalSnapshot["items"][number] =>
        Boolean(item) && typeof item.productId === "string" && typeof item.quantity === "number",
    ),
  };
}

function formatQuantity(quantity: number, unit: string) {
  const label = unit === "PCS" ? "Stk" : unit;
  return `${quantity.toLocaleString("de-AT")} ${label}`;
}

/** Human-readable list of what the Freigeber changed compared to the original order. */
export function describeApprovalChanges(original: ApprovalSnapshot | null, current: ApprovalSnapshot): string[] {
  if (!original) return [];
  const changes: string[] = [];

  if (original.costCenterId !== current.costCenterId) {
    changes.push(`Kostenstelle: ${original.costCenterLabel || "-"} → ${current.costCenterLabel || "-"}`);
  }

  const currentByProduct = new Map(current.items.map((item) => [item.productId, item]));
  for (const item of original.items) {
    const next = currentByProduct.get(item.productId);
    if (!next) {
      changes.push(`${item.name}: entfernt`);
    } else if (next.quantity !== item.quantity) {
      changes.push(`${item.name}: ${formatQuantity(item.quantity, item.unit)} → ${formatQuantity(next.quantity, next.unit)}`);
    }
  }

  return changes;
}

export function orderTotal(items: Array<{ quantity: unknown; price: unknown }>) {
  return items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.price), 0);
}
