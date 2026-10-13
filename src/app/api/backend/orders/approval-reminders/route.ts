import { NextResponse } from "next/server";

import { env } from "~/env";
import { db } from "~/server/db";
import { orderTotal } from "~/server/approval/rules";
import { loadApproversForOrder } from "~/server/approval/service";
import { notifyApprovalReminder } from "~/server/mail/approval-events";
import { getAppSettings } from "~/server/settings";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Reminds Freigeber/Vertretung about orders pending longer than `approval.reminderAfterDays`.
 * Each order is reminded at most once per interval (tracked via Order.approvalReminderSentAt).
 */
export async function POST(request: Request) {
  const secret = env.CRON_SECRET ?? env.LOAN_REMINDER_CRON_SECRET;
  if (secret) {
    const provided = request.headers.get("x-cron-secret");
    if (!provided || provided.trim() !== secret.trim()) {
      return NextResponse.json({ ok: false, reason: "UNAUTHORIZED" }, { status: 401 });
    }
  }

  const settings = await getAppSettings();
  const days = settings.approval.reminderAfterDays;
  if (!settings.approval.enabled || !settings.mail.approvalReminder || days <= 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "DISABLED" });
  }

  const now = new Date();
  const threshold = new Date(now.getTime() - days * DAY_MS);
  const orders = await db.order.findMany({
    where: {
      approvalStatus: "PENDING",
      OR: [
        { approvalReminderSentAt: null, createdAt: { lte: threshold } },
        { approvalReminderSentAt: { lte: threshold } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      approvalGroupId: true,
      user: { select: { name: true, email: true } },
      items: { select: { quantity: true, product: { select: { price: true } } } },
    },
  });

  const approversByGroup = new Map<string, Awaited<ReturnType<typeof loadApproversForOrder>>>();
  const ordersByApprover = new Map<
    string,
    { approver: { name: string | null; email: string | null }; orderIds: string[]; orders: Parameters<typeof notifyApprovalReminder>[0]["orders"] }
  >();

  for (const order of orders) {
    const groupKey = order.approvalGroupId ?? "";
    let approvers = approversByGroup.get(groupKey);
    if (!approvers) {
      approvers = await loadApproversForOrder(db, order.approvalGroupId);
      approversByGroup.set(groupKey, approvers);
    }

    for (const approver of approvers) {
      const bucket = ordersByApprover.get(approver.id) ?? { approver, orderIds: [], orders: [] };
      bucket.orderIds.push(order.id);
      bucket.orders.push({
        orderNumber: order.orderNumber,
        orderer: order.user,
        createdAt: order.createdAt,
        total: orderTotal(order.items.map((item) => ({ quantity: item.quantity, price: item.product.price }))),
      });
      ordersByApprover.set(approver.id, bucket);
    }
  }

  let sent = 0;
  let failed = 0;
  const remindedOrderIds = new Set<string>();
  for (const bucket of ordersByApprover.values()) {
    try {
      const result = await notifyApprovalReminder({ approver: bucket.approver, orders: bucket.orders });
      if (!result.skipped) sent += 1;
      bucket.orderIds.forEach((id) => remindedOrderIds.add(id));
    } catch (error) {
      failed += 1;
      console.error("[approval-reminders] reminder failed", error);
    }
  }

  if (remindedOrderIds.size > 0) {
    await db.order.updateMany({
      where: { id: { in: [...remindedOrderIds] } },
      data: { approvalReminderSentAt: now },
    });
  }

  return NextResponse.json({ ok: true, sent, failed, orders: remindedOrderIds.size });
}
