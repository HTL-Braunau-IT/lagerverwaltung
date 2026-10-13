import type { Prisma } from "@prisma/client";

import { orderTotal } from "~/server/approval/rules";
import { loadApproversForOrder } from "~/server/approval/service";
import {
  notifyApprovalCancelled,
  notifyApprovalDecided,
  notifyApprovalRequested,
  notifyOrderReleased,
} from "~/server/mail/approval-events";

type Db = Prisma.TransactionClient;

async function loadOrderMailContext(db: Db, orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      workerNote: true,
      approvalStatus: true,
      approvalGroupId: true,
      approvalNote: true,
      user: { select: { name: true, email: true } },
      approvalDecidedBy: { select: { name: true, email: true } },
      sourceRequest: { select: { student: { select: { name: true, email: true } } } },
      costCenter: { select: { code: true, name: true } },
      items: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          quantity: true,
          product: { select: { name: true, price: true, baseUnit: true } },
        },
      },
    },
  });
  if (!order) return null;

  return {
    raw: order,
    info: {
      id: order.id,
      orderNumber: order.orderNumber,
      total: orderTotal(order.items.map((item) => ({ quantity: item.quantity, price: item.product.price }))),
      costCenterLabel: order.costCenter.name,
      workerNote: order.workerNote,
      items: order.items.map((item) => ({
        name: item.product.name,
        quantity: item.quantity,
        unit: item.product.baseUnit,
        price: item.product.price,
      })),
    },
    orderer: order.user,
    student: order.sourceRequest?.student ?? null,
  };
}

function runInBackground(label: string, task: () => Promise<unknown>) {
  task().catch((error) => {
    console.error(`[mail.${label}] notification failed`, error);
  });
}

/** After an order was created: ask for approval (E1) or tell the warehouse (E5). */
export function dispatchOrderPlaced(db: Db, orderId: string) {
  runInBackground("orderPlaced", async () => {
    const context = await loadOrderMailContext(db, orderId);
    if (!context) return;

    if (context.raw.approvalStatus === "PENDING") {
      const approvers = await loadApproversForOrder(db, context.raw.approvalGroupId);
      await notifyApprovalRequested({
        order: context.info,
        orderer: context.orderer,
        student: context.student,
        approvers,
      });
      return;
    }

    await notifyOrderReleased({ order: context.info, orderer: context.orderer, student: context.student });
  });
}

/** After a Freigeber decided: inform the orderer (E2/E3) and, when approved, the warehouse (E5). */
export function dispatchApprovalDecided(db: Db, orderId: string, changes: string[]) {
  runInBackground("approvalDecided", async () => {
    const context = await loadOrderMailContext(db, orderId);
    if (!context) return;
    const decision = context.raw.approvalStatus;
    if (decision !== "APPROVED" && decision !== "REJECTED") return;

    const decidedBy = context.raw.approvalDecidedBy ?? {};
    await notifyApprovalDecided({
      decision,
      order: context.info,
      orderer: context.orderer,
      student: context.student,
      decidedBy,
      note: context.raw.approvalNote,
      changes,
    });

    if (decision === "APPROVED") {
      await notifyOrderReleased({
        order: context.info,
        orderer: context.orderer,
        student: context.student,
        approvedBy: decidedBy,
      });
    }
  });
}

/** After the orderer withdrew a pending order (E7). */
export function dispatchApprovalCancelled(db: Db, orderId: string) {
  runInBackground("approvalCancelled", async () => {
    const context = await loadOrderMailContext(db, orderId);
    if (!context) return;
    const approvers = await loadApproversForOrder(db, context.raw.approvalGroupId);
    await notifyApprovalCancelled({ order: context.info, orderer: context.orderer, approvers });
  });
}
