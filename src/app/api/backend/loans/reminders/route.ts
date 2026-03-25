import { NextResponse } from "next/server";

import { env } from "~/env";
import { db } from "~/server/db";
import { sendLoanReminder } from "~/server/mail/loan-events";

function toUTCDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function diffDaysUTC(a: Date, b: Date) {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export async function POST(request: Request) {
  if (env.LOAN_REMINDER_CRON_SECRET) {
    const provided = request.headers.get("x-cron-secret");
    if (!provided || provided.trim() !== env.LOAN_REMINDER_CRON_SECRET.trim()) {
      return NextResponse.json({ ok: false, reason: "UNAUTHORIZED" }, { status: 401 });
    }
  }

  const now = new Date();
  const nowDay = toUTCDateOnly(now);

  // Candidates:
  // - loan must be APPROVED (i.e. reserved/outstanding)
  // - dueAt must be set and not in the future
  const candidates = await db.loanItem.findMany({
    where: {
      dueAt: { lte: now },
      loan: { status: "APPROVED" },
    },
    select: {
      id: true,
      borrowedAt: true,
      dueAt: true,
      quantityHandedOver: true,
      quantityReturned: true,
      lendableItem: { select: { name: true } },
      loan: {
        select: {
          borrower: { select: { name: true, email: true } },
        },
      },
    },
  });

  let sent = 0;
  let skipped = 0;

  for (const item of candidates) {
    if (!item.borrowedAt || !item.dueAt) continue;

    const activeBorrowed =
      Number(item.quantityHandedOver) - Number(item.quantityReturned);
    if (activeBorrowed <= 0) continue;

    const dueDay = toUTCDateOnly(item.dueAt);
    const dayDiff = diffDaysUTC(dueDay, nowDay);
    if (dayDiff < 0) continue;

    let trigger: "DUE" | "OVERDUE" | null = null;
    if (dayDiff === 0) trigger = "DUE";
    else if (dayDiff > 0 && dayDiff % 3 === 0) trigger = "OVERDUE";

    if (!trigger) continue;

    // Idempotency: only one email per loanItem + trigger + day.
    const created = await db.loanReminderLog.createMany({
      data: [{ loanItemId: item.id, trigger, sentForDate: nowDay }],
      skipDuplicates: true,
    });

    if (created.count === 0) {
      skipped += 1;
      continue;
    }

    await sendLoanReminder({
      borrower: { name: item.loan.borrower.name, email: item.loan.borrower.email },
      itemName: item.lendableItem.name,
      borrowedAt: item.borrowedAt,
      dueAt: item.dueAt,
    });

    sent += 1;
  }

  return NextResponse.json({ ok: true, sent, skipped });
}

