import {
  buildEmailTemplate,
  emailItemList,
  emailButton,
  emailMetaList,
  emailSection,
  emailSectionTitle,
  emailStatusBadge,
  htmlToText,
} from "~/server/mail/email-template";
import { resolveOpsBccRecipients } from "~/server/settings";
import { sendGraphMail, type MailRecipient } from "~/server/mail/graph-mailer";

type OrderStatusEmail = "OPEN" | "PREPARING" | "READY_FOR_PICKUP";

export type MaybeUser = {
  name?: string | null;
  email?: string | null;
};

type StudentRequestCreatedInput = {
  requestId: string;
  teacher: MaybeUser;
  student: MaybeUser;
  items: OrderLineItem[];
};

type TeacherRequestApprovedInput = {
  requestId: string;
  orderNumber: string;
  teacher: MaybeUser;
  student: MaybeUser;
  items: OrderLineItem[];
  /** The teacher's group Freigeber still has to approve the resulting order. */
  awaitingFinalApproval?: boolean;
};

type OrderStatusChangedInput = {
  orderNumber: string;
  status: OrderStatusEmail;
  owner: MaybeUser;
  requester?: MaybeUser;
  items: OrderLineItem[];
};

export type OrderLineItem = {
  name: string;
  quantity: unknown;
  unit?: string | null;
  price?: unknown;
};

export function recipientFromUser(user: MaybeUser): MailRecipient | null {
  const email = user.email?.trim();
  if (!email) return null;
  return {
    email,
    name: user.name?.trim() || undefined,
  };
}

export function makeGreeting(name?: string | null) {
  const clean = name?.trim();
  return clean ? `Hallo ${clean},` : "Hallo,";
}

function statusLabel(status: OrderStatusEmail) {
  if (status === "PREPARING") return "In Vorbereitung";
  if (status === "READY_FOR_PICKUP") return "Abholbereit";
  return "Offen";
}

export function opsBccRecipient() {
  return resolveOpsBccRecipients();
}

export function valueToText(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (value && typeof value === "object" && "toString" in value && typeof value.toString === "function") {
    return value.toString();
  }
  return "";
}

export function formatLineItems(items: OrderLineItem[]) {
  if (items.length === 0) return ["(keine Positionen übergeben)"];
  return items.map((item) => {
    const quantity = valueToText(item.quantity) || "?";
    const priceRaw = valueToText(item.price);
    const unit = item.unit?.trim() ? ` ${item.unit}` : "";
    const priceText = priceRaw ? ` | Einzelpreis: ${priceRaw} EUR` : "";
    return `${item.name}: Menge ${quantity}${unit}${priceText}`;
  });
}

export function buildOrderEmail(input: {
  title: string;
  intro: string[];
  metaRows?: Array<{ label: string; value: string }>;
  itemsTitle?: string;
  items?: string[];
  extraLists?: Array<{ title: string; items: string[] }>;
  status?: { label: string; tone: "primary" | "success" | "destructive" };
  action?: { label: string; href: string };
  footer?: string[];
}) {
  const sections: string[] = [];
  if (input.action) {
    sections.push(emailButton(input.action.label, input.action.href));
  }
  if (input.status) {
    sections.push(emailSection(`${emailSectionTitle("Status")}${emailStatusBadge(input.status.label, input.status.tone)}`));
  }
  if (input.metaRows && input.metaRows.length > 0) {
    sections.push(emailSection(`${emailSectionTitle("Details")}${emailMetaList(input.metaRows)}`));
  }
  if (input.itemsTitle) {
    sections.push(
      emailSection(
        `${emailSectionTitle(input.itemsTitle)}${emailItemList(input.items ?? [])}`,
      ),
    );
  }
  for (const list of input.extraLists ?? []) {
    if (list.items.length === 0) continue;
    sections.push(emailSection(`${emailSectionTitle(list.title)}${emailItemList(list.items)}`));
  }

  const htmlBody = buildEmailTemplate({
    preheader: input.title,
    title: input.title,
    intro: input.intro,
    sections,
    footer: input.footer ?? [],
  });

  return {
    htmlBody,
    textFallback: htmlToText(htmlBody),
  };
}

export async function notifyStudentRequestCreated(input: StudentRequestCreatedInput) {
  const teacher = recipientFromUser(input.teacher);
  if (!teacher) return { skipped: true as const };

  const student = recipientFromUser(input.student);
  const subject = `Neue Bestellanfrage ${input.requestId}`;
  const mail = buildOrderEmail({
    title: "Neue Bestellanfrage",
    intro: [makeGreeting(input.teacher.name), "eine Schülerin oder ein Schüler hat eine neue Bestellanfrage zur Freigabe eingereicht."],
    metaRows: [
      { label: "Schüler/in", value: `${input.student.name ?? "-"} (${input.student.email ?? "-"})` },
      { label: "Anfrage-ID", value: input.requestId },
    ],
    itemsTitle: "Angefragte Artikel",
    items: formatLineItems(input.items),
    footer: ["Bitte prüfen und bearbeiten Sie die Anfrage im System."],
  });

  await sendGraphMail({
    to: [teacher],
    cc: student ? [student] : [],
    bcc: await opsBccRecipient(),
    subject,
    htmlBody: mail.htmlBody,
    textFallback: mail.textFallback,
  });
  return { skipped: false as const };
}

export async function notifyTeacherRequestApproved(input: TeacherRequestApprovedInput) {
  const student = recipientFromUser(input.student);
  if (!student) return { skipped: true as const };

  const teacher = recipientFromUser(input.teacher);
  const subject = input.awaitingFinalApproval
    ? `Bestellung ${input.orderNumber} wartet auf finale Freigabe`
    : `Bestellung ${input.orderNumber} wurde freigegeben`;
  const mail = buildOrderEmail({
    title: input.awaitingFinalApproval
      ? `Bestellung ${input.orderNumber} wartet auf finale Freigabe`
      : `Bestellung ${input.orderNumber} freigegeben`,
    intro: [
      makeGreeting(input.student.name),
      input.awaitingFinalApproval
        ? "deine Bestellanfrage wurde von der Lehrperson bestätigt und wartet nun noch auf die finale Freigabe."
        : "deine Bestellanfrage wurde von der Lehrperson freigegeben.",
    ],
    metaRows: [
      { label: "Lehrperson", value: `${input.teacher.name ?? "-"} (${input.teacher.email ?? "-"})` },
      { label: "Anfrage-ID", value: input.requestId },
      { label: "Bestellnummer", value: input.orderNumber },
    ],
    itemsTitle: "Freigegebene Artikel",
    items: formatLineItems(input.items),
    footer: ["Du bekommst weitere Updates, wenn sich der Bestellstatus ändert."],
  });

  await sendGraphMail({
    to: [student],
    cc: teacher ? [teacher] : [],
    bcc: await opsBccRecipient(),
    subject,
    htmlBody: mail.htmlBody,
    textFallback: mail.textFallback,
  });
  return { skipped: false as const };
}

export async function notifyOrderStatusChanged(input: OrderStatusChangedInput) {
  if (input.status !== "READY_FOR_PICKUP") {
    return { skipped: true as const };
  }

  const owner = recipientFromUser(input.owner);
  if (!owner) return { skipped: true as const };
  const requester = recipientFromUser(input.requester ?? {});
  const requesterIsOwner =
    requester?.email.trim().toLowerCase() === owner.email.trim().toLowerCase();
  const ccRecipients = requester && !requesterIsOwner ? [requester] : [];

  const readableStatus = statusLabel(input.status);
  const subject = `Statusupdate Bestellung ${input.orderNumber}: ${readableStatus}`;
  const mail = buildOrderEmail({
    title: `Statusupdate: Bestellung ${input.orderNumber}`,
    intro: [makeGreeting(input.owner.name), "der Status deiner Bestellung hat sich geändert."],
    status: {
      label: readableStatus,
      tone: input.status === "READY_FOR_PICKUP" ? "success" : "primary",
    },
    metaRows: [
      {
        label: "Besteller/in",
        value: `${input.requester?.name ?? input.owner.name ?? "-"} (${input.requester?.email ?? input.owner.email ?? "-"})`,
      },
      { label: "Bestellnummer", value: input.orderNumber },
    ],
    itemsTitle: "Artikel in dieser Bestellung",
    items: formatLineItems(input.items),
  });

  await sendGraphMail({
    to: [owner],
    cc: ccRecipients,
    bcc: await opsBccRecipient(),
    subject,
    htmlBody: mail.htmlBody,
    textFallback: mail.textFallback,
  });
  return { skipped: false as const };
}
