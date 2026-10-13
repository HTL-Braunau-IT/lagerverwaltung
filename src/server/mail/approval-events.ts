import { env } from "~/env";
import { sendGraphMail, type MailRecipient } from "~/server/mail/graph-mailer";
import {
  buildOrderEmail,
  formatLineItems,
  makeGreeting,
  opsBccRecipient,
  recipientFromUser,
  type MaybeUser,
  type OrderLineItem,
} from "~/server/mail/order-events";
import { getAppSettings } from "~/server/settings";

type ApprovalOrderInfo = {
  id: string;
  orderNumber: string;
  total: number;
  costCenterLabel: string;
  workerNote?: string | null;
  items: OrderLineItem[];
};

function appUrl(path: string) {
  return `${env.AUTH_URL.replace(/\/+$/, "")}${path}`;
}

function approvalUrl(orderId: string) {
  return appUrl(`/teacher/orders?freigabe=${encodeURIComponent(orderId)}`);
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(value);
}

function userLabel(user: MaybeUser) {
  const name = user.name?.trim();
  const email = user.email?.trim();
  if (name && email) return `${name} (${email})`;
  return name || email || "-";
}

function uniqueRecipients(users: MaybeUser[], exclude: MailRecipient[] = []) {
  const seen = new Set(exclude.map((recipient) => recipient.email.toLowerCase()));
  const result: MailRecipient[] = [];
  for (const user of users) {
    const recipient = recipientFromUser(user);
    if (!recipient) continue;
    const key = recipient.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(recipient);
  }
  return result;
}

function orderMetaRows(order: ApprovalOrderInfo, orderer: MaybeUser, student?: MaybeUser | null) {
  return [
    { label: "Bestellnummer", value: order.orderNumber },
    { label: "Besteller/in", value: userLabel(orderer) },
    ...(student ? [{ label: "Für Schüler/in", value: userLabel(student) }] : []),
    { label: "Kostenstelle", value: order.costCenterLabel || "-" },
    { label: "Summe", value: formatEuro(order.total) },
    ...(order.workerNote?.trim() ? [{ label: "Hinweis", value: order.workerNote.trim() }] : []),
  ];
}

/** E1: an order is waiting for the Freigeber (+ Vertretung). */
export async function notifyApprovalRequested(input: {
  order: ApprovalOrderInfo;
  orderer: MaybeUser;
  student?: MaybeUser | null;
  approvers: MaybeUser[];
}) {
  const settings = await getAppSettings();
  if (!settings.mail.approvalRequested) return { skipped: true as const };

  const to = uniqueRecipients(input.approvers);
  if (to.length === 0) return { skipped: true as const };
  const cc = uniqueRecipients([input.orderer], to);

  const mail = buildOrderEmail({
    title: `Bestellung ${input.order.orderNumber} wartet auf Freigabe`,
    intro: [
      "Hallo,",
      `${input.orderer.name?.trim() || "Eine Lehrperson"} hat eine Bestellung aufgegeben, die Ihre Freigabe benötigt.`,
    ],
    action: { label: "Bestellung prüfen", href: approvalUrl(input.order.id) },
    metaRows: orderMetaRows(input.order, input.orderer, input.student),
    itemsTitle: "Bestellte Artikel",
    items: formatLineItems(input.order.items),
    footer: [
      "Sie können Mengen anpassen, Positionen entfernen oder die Kostenstelle ändern, bevor Sie freigeben.",
      "Die Bestellung wird erst nach Ihrer Freigabe an das Lager weitergeleitet.",
    ],
  });

  await sendGraphMail({
    to,
    cc,
    bcc: await opsBccRecipient(),
    subject: `Freigabe erforderlich: Bestellung ${input.order.orderNumber}`,
    htmlBody: mail.htmlBody,
    textFallback: mail.textFallback,
  });
  return { skipped: false as const };
}

/** E2/E3: the Freigeber approved or rejected an order. */
export async function notifyApprovalDecided(input: {
  decision: "APPROVED" | "REJECTED";
  order: ApprovalOrderInfo;
  orderer: MaybeUser;
  student?: MaybeUser | null;
  decidedBy: MaybeUser;
  note?: string | null;
  changes: string[];
}) {
  const settings = await getAppSettings();
  if (!settings.mail.approvalDecided) return { skipped: true as const };

  const orderer = recipientFromUser(input.orderer);
  if (!orderer) return { skipped: true as const };
  const cc = uniqueRecipients(input.student ? [input.student] : [], [orderer]);

  const approved = input.decision === "APPROVED";
  const note = input.note?.trim();
  const mail = buildOrderEmail({
    title: approved
      ? `Bestellung ${input.order.orderNumber} freigegeben`
      : `Bestellung ${input.order.orderNumber} abgelehnt`,
    intro: [
      makeGreeting(input.orderer.name),
      approved
        ? `Ihre Bestellung wurde von ${input.decidedBy.name?.trim() || "der Freigabestelle"} freigegeben und an das Lager weitergeleitet.`
        : `Ihre Bestellung wurde von ${input.decidedBy.name?.trim() || "der Freigabestelle"} abgelehnt.`,
    ],
    status: approved ? { label: "Freigegeben", tone: "success" } : { label: "Abgelehnt", tone: "destructive" },
    metaRows: [
      ...orderMetaRows(input.order, input.orderer, input.student),
      { label: "Entschieden von", value: userLabel(input.decidedBy) },
      ...(note ? [{ label: approved ? "Kommentar" : "Begründung", value: note }] : []),
    ],
    extraLists: approved ? [{ title: "Änderungen durch die Freigabe", items: input.changes }] : [],
    itemsTitle: approved ? "Freigegebene Artikel" : "Abgelehnte Artikel",
    items: formatLineItems(input.order.items),
    action: { label: "Bestellhistorie öffnen", href: appUrl("/orders") },
    footer: approved ? ["Sie erhalten eine weitere Nachricht, sobald die Bestellung abholbereit ist."] : [],
  });

  await sendGraphMail({
    to: [orderer],
    cc,
    bcc: await opsBccRecipient(),
    subject: approved
      ? `Bestellung ${input.order.orderNumber} wurde freigegeben`
      : `Bestellung ${input.order.orderNumber} wurde abgelehnt`,
    htmlBody: mail.htmlBody,
    textFallback: mail.textFallback,
  });
  return { skipped: false as const };
}

/** E7: the orderer withdrew a pending order. */
export async function notifyApprovalCancelled(input: {
  order: ApprovalOrderInfo;
  orderer: MaybeUser;
  approvers: MaybeUser[];
}) {
  const settings = await getAppSettings();
  if (!settings.mail.approvalCancelled) return { skipped: true as const };

  const to = uniqueRecipients(input.approvers);
  if (to.length === 0) return { skipped: true as const };

  const mail = buildOrderEmail({
    title: `Bestellung ${input.order.orderNumber} zurückgezogen`,
    intro: [
      "Hallo,",
      `${input.orderer.name?.trim() || "Die Lehrperson"} hat die Bestellung zurückgezogen. Es ist keine Freigabe mehr nötig.`,
    ],
    metaRows: orderMetaRows(input.order, input.orderer),
    itemsTitle: "Artikel",
    items: formatLineItems(input.order.items),
  });

  await sendGraphMail({
    to,
    bcc: await opsBccRecipient(),
    subject: `Bestellung ${input.order.orderNumber} zurückgezogen`,
    htmlBody: mail.htmlBody,
    textFallback: mail.textFallback,
  });
  return { skipped: false as const };
}

/** E4: reminder for an approver with orders pending longer than the configured days. */
export async function notifyApprovalReminder(input: {
  approver: MaybeUser;
  orders: Array<{ orderNumber: string; orderer: MaybeUser; createdAt: Date; total: number }>;
}) {
  const settings = await getAppSettings();
  if (!settings.mail.approvalReminder) return { skipped: true as const };

  const approver = recipientFromUser(input.approver);
  if (!approver || input.orders.length === 0) return { skipped: true as const };

  const dateFormat = new Intl.DateTimeFormat("de-AT", { dateStyle: "medium" });
  const count = input.orders.length;
  const mail = buildOrderEmail({
    title: count === 1 ? "1 Bestellung wartet auf Freigabe" : `${count} Bestellungen warten auf Freigabe`,
    intro: [makeGreeting(input.approver.name), "folgende Bestellungen warten noch auf Ihre Entscheidung:"],
    action: { label: "Freigaben öffnen", href: appUrl("/teacher/orders") },
    itemsTitle: "Offene Freigaben",
    items: input.orders.map(
      (order) =>
        `${order.orderNumber} – ${order.orderer.name?.trim() || order.orderer.email || "-"} – ${formatEuro(order.total)} – seit ${dateFormat.format(order.createdAt)}`,
    ),
  });

  await sendGraphMail({
    to: [approver],
    bcc: await opsBccRecipient(),
    subject: `Erinnerung: ${count} offene Freigabe${count === 1 ? "" : "n"}`,
    htmlBody: mail.htmlBody,
    textFallback: mail.textFallback,
  });
  return { skipped: false as const };
}

/** E5: an order reached the warehouse (approved or no approval needed). */
export async function notifyOrderReleased(input: {
  order: ApprovalOrderInfo;
  orderer: MaybeUser;
  student?: MaybeUser | null;
  approvedBy?: MaybeUser | null;
}) {
  const settings = await getAppSettings();
  const warehouseAddress = settings.mail.warehouseAddress.trim();
  if (!settings.mail.orderReleased || !warehouseAddress) return { skipped: true as const };

  const mail = buildOrderEmail({
    title: `Neue Bestellung ${input.order.orderNumber}`,
    intro: ["Hallo,", "eine neue Bestellung ist eingegangen und kann vorbereitet werden."],
    action: { label: "Im Backend öffnen", href: appUrl(`/backend/orders?search=${encodeURIComponent(input.order.orderNumber)}`) },
    metaRows: [
      ...orderMetaRows(input.order, input.orderer, input.student),
      ...(input.approvedBy ? [{ label: "Freigegeben von", value: userLabel(input.approvedBy) }] : []),
    ],
    itemsTitle: "Artikel",
    items: formatLineItems(input.order.items),
  });

  await sendGraphMail({
    to: [{ email: warehouseAddress }],
    subject: `Neue Bestellung ${input.order.orderNumber}`,
    htmlBody: mail.htmlBody,
    textFallback: mail.textFallback,
  });
  return { skipped: false as const };
}
