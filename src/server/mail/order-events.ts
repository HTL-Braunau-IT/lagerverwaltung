import { env } from "~/env";
import { sendGraphMail, type MailRecipient } from "~/server/mail/graph-mailer";

type OrderStatusEmail = "OPEN" | "PREPARING" | "READY_FOR_PICKUP";

type MaybeUser = {
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
};

type OrderCreatedInput = {
  orderNumber: string;
  owner: MaybeUser;
  selfOrderByTeacher: boolean;
  items: OrderLineItem[];
};

type OrderStatusChangedInput = {
  orderNumber: string;
  status: OrderStatusEmail;
  owner: MaybeUser;
  requester?: MaybeUser;
  items: OrderLineItem[];
};

type OrderLineItem = {
  name: string;
  quantity: unknown;
  unit?: string | null;
  price?: unknown;
};

function recipientFromUser(user: MaybeUser): MailRecipient | null {
  const email = user.email?.trim();
  if (!email) return null;
  return {
    email,
    name: user.name?.trim() || undefined,
  };
}

function makeGreeting(name?: string | null) {
  const clean = name?.trim();
  return clean ? `Hallo ${clean},` : "Hallo,";
}

function statusLabel(status: OrderStatusEmail) {
  if (status === "PREPARING") return "In Vorbereitung";
  if (status === "READY_FOR_PICKUP") return "Abholbereit";
  return "Offen";
}

function opsBccRecipient() {
  const email = env.MAIL_OPS_BCC_ADDRESS?.trim();
  if (!email) return [];
  return [{ email }];
}

function valueToText(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (value && typeof value === "object" && "toString" in value && typeof value.toString === "function") {
    return value.toString();
  }
  return "";
}

function formatLineItems(items: OrderLineItem[]) {
  if (items.length === 0) return ["- (keine Positionen uebergeben)"];
  return items.map((item) => {
    const quantity = valueToText(item.quantity) || "?";
    const priceRaw = valueToText(item.price);
    const unit = item.unit?.trim() ? ` ${item.unit}` : "";
    const priceText = priceRaw ? ` | Einzelpreis: ${priceRaw} EUR` : "";
    return `- ${item.name}: Menge ${quantity}${unit}${priceText}`;
  });
}

export async function notifyStudentRequestCreated(input: StudentRequestCreatedInput) {
  const teacher = recipientFromUser(input.teacher);
  if (!teacher) return { skipped: true as const };

  const student = recipientFromUser(input.student);
  const subject = `Neue Bestellanfrage ${input.requestId}`;
  const body = [
    makeGreeting(input.teacher.name),
    "",
    "eine Schuelerin oder ein Schueler hat eine neue Bestellanfrage zur Freigabe eingereicht.",
    `Schueler/in: ${input.student.name ?? "-"} (${input.student.email ?? "-"})`,
    `Anfrage-ID: ${input.requestId}`,
    "",
    "Angefragte Artikel:",
    ...formatLineItems(input.items),
    "",
    "Bitte pruefen und bearbeiten Sie die Anfrage im System.",
  ].join("\n");

  await sendGraphMail({
    to: [teacher],
    cc: student ? [student] : [],
    bcc: opsBccRecipient(),
    subject,
    textBody: body,
  });
  return { skipped: false as const };
}

export async function notifyTeacherRequestApproved(input: TeacherRequestApprovedInput) {
  const student = recipientFromUser(input.student);
  if (!student) return { skipped: true as const };

  const teacher = recipientFromUser(input.teacher);
  const subject = `Bestellung ${input.orderNumber} wurde freigegeben`;
  const body = [
    makeGreeting(input.student.name),
    "",
    "deine Bestellanfrage wurde von der Lehrperson freigegeben.",
    `Lehrperson: ${input.teacher.name ?? "-"} (${input.teacher.email ?? "-"})`,
    `Anfrage-ID: ${input.requestId}`,
    `Bestellnummer: ${input.orderNumber}`,
    "",
    "Freigegebene Artikel:",
    ...formatLineItems(input.items),
    "",
    "Du bekommst weitere Updates, wenn sich der Bestellstatus aendert.",
  ].join("\n");

  await sendGraphMail({
    to: [student],
    cc: teacher ? [teacher] : [],
    bcc: opsBccRecipient(),
    subject,
    textBody: body,
  });
  return { skipped: false as const };
}

export async function notifyOrderCreated(input: OrderCreatedInput) {
  const owner = recipientFromUser(input.owner);
  if (!owner) return { skipped: true as const };

  const subject = input.selfOrderByTeacher
    ? `Ihre Bestellung ${input.orderNumber} wurde erstellt`
    : `Bestellung ${input.orderNumber} wurde erstellt`;
  const body = [
    makeGreeting(input.owner.name),
    "",
    input.selfOrderByTeacher
      ? "deine eigene Lehrer-Bestellung wurde erfolgreich angelegt."
      : "deine Bestellung wurde erfolgreich angelegt.",
    `Bestellnummer: ${input.orderNumber}`,
    "",
    "Bestellte Artikel:",
    ...formatLineItems(input.items),
    "",
    "Du bekommst weitere Updates, wenn sich der Status aendert.",
  ].join("\n");

  await sendGraphMail({
    to: [owner],
    bcc: opsBccRecipient(),
    subject,
    textBody: body,
  });
  return { skipped: false as const };
}

export async function notifyOrderStatusChanged(input: OrderStatusChangedInput) {
  if (!["PREPARING", "READY_FOR_PICKUP"].includes(input.status)) {
    return { skipped: true as const };
  }

  const owner = recipientFromUser(input.owner);
  if (!owner) return { skipped: true as const };

  const readableStatus = statusLabel(input.status);
  const subject = `Statusupdate Bestellung ${input.orderNumber}: ${readableStatus}`;
  const body = [
    makeGreeting(input.owner.name),
    "",
    "der Status deiner Bestellung hat sich geaendert.",
    `Besteller/in: ${input.requester?.name ?? input.owner.name ?? "-"} (${input.requester?.email ?? input.owner.email ?? "-"})`,
    `Bestellnummer: ${input.orderNumber}`,
    `Neuer Status: ${readableStatus}`,
    "",
    "Artikel in dieser Bestellung:",
    ...formatLineItems(input.items),
  ].join("\n");

  await sendGraphMail({
    to: [owner],
    bcc: opsBccRecipient(),
    subject,
    textBody: body,
  });
  return { skipped: false as const };
}
