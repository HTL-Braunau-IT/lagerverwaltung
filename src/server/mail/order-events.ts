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
};

type TeacherRequestApprovedInput = {
  requestId: string;
  orderNumber: string;
  teacher: MaybeUser;
  student: MaybeUser;
};

type OrderCreatedInput = {
  orderNumber: string;
  owner: MaybeUser;
  selfOrderByTeacher: boolean;
};

type OrderStatusChangedInput = {
  orderNumber: string;
  status: OrderStatusEmail;
  owner: MaybeUser;
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

export async function notifyStudentRequestCreated(input: StudentRequestCreatedInput) {
  const teacher = recipientFromUser(input.teacher);
  if (!teacher) return { skipped: true as const };

  const student = recipientFromUser(input.student);
  const subject = `Neue Bestellanfrage ${input.requestId}`;
  const body = [
    makeGreeting(input.teacher.name),
    "",
    "eine Schuelerin oder ein Schueler hat eine neue Bestellanfrage zur Freigabe eingereicht.",
    `Anfrage-ID: ${input.requestId}`,
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
    `Anfrage-ID: ${input.requestId}`,
    `Bestellnummer: ${input.orderNumber}`,
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
    `Bestellnummer: ${input.orderNumber}`,
    `Neuer Status: ${readableStatus}`,
  ].join("\n");

  await sendGraphMail({
    to: [owner],
    bcc: opsBccRecipient(),
    subject,
    textBody: body,
  });
  return { skipped: false as const };
}
