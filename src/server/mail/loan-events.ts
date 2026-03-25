import { env } from "~/env";
import { sendGraphMail, type MailRecipient } from "~/server/mail/graph-mailer";

type MaybeUser = {
  name?: string | null;
  email?: string | null;
};

type LoanLineItem = {
  name: string;
  quantity: unknown;
  unit?: string | null;
};

type LoanApprovedInput = {
  borrower: MaybeUser;
  teacher?: MaybeUser;
  loanId: string;
  items: LoanLineItem[];
};

type LoanRejectedInput = {
  borrower: MaybeUser;
  teacher?: MaybeUser;
  loanId: string;
};

type LoanHandoverConfirmedInput = {
  borrower: MaybeUser;
  loanId: string;
  items: Array<LoanLineItem & { dueAt?: Date | null }>;
};

type LoanReturnedInput = {
  borrower: MaybeUser;
  loanId: string;
  items: LoanLineItem[];
};

type LoanReminderInput = {
  borrower: MaybeUser;
  itemName: string;
  borrowedAt: Date;
  dueAt: Date | null;
};

function recipientFromUser(user: MaybeUser): MailRecipient | null {
  const email = user.email?.trim();
  if (!email) return null;
  return { email, name: user.name?.trim() || undefined };
}

function makeGreeting(name?: string | null) {
  const clean = name?.trim();
  return clean ? `Hallo ${clean},` : "Hallo,";
}

function opsBccRecipient() {
  const email = env.MAIL_OPS_BCC_ADDRESS?.trim();
  if (!email) return [];
  return [{ email }];
}

function valueToText(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (value && typeof value === "object" && "toString" in value) {
    const maybeToString = (value as { toString?: unknown }).toString;
    if (typeof maybeToString === "function") {
      return String(maybeToString.call(value));
    }
  }
  return "";
}

function formatLineItems(items: LoanLineItem[]) {
  if (items.length === 0) return ["- (keine Positionen uebergeben)"];
  return items.map((item) => {
    const quantity = valueToText(item.quantity) || "?";
    const unit = item.unit?.trim() ? ` ${item.unit}` : "";
    return `- ${item.name}: Menge ${quantity}${unit}`;
  });
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: undefined }).format(value);
}

function floorDaysBetween(a: Date, b: Date) {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export async function notifyLoanApproved(input: LoanApprovedInput) {
  const borrower = recipientFromUser(input.borrower);
  if (!borrower) return { skipped: true as const };

  const teacher = input.teacher ? recipientFromUser(input.teacher) : null;
  const subject = `Ausleihe freigegeben (Anfrage ${input.loanId})`;

  const body = [
    makeGreeting(input.borrower.name),
    "",
    "Deine Ausleihe wurde freigegeben.",
    teacher ? `Lehrperson: ${teacher.name ?? "-"}` : "",
    "",
    "Artikel:",
    ...formatLineItems(input.items),
    "",
    "Du bekommst weitere Updates, wenn sich der Status aendert.",
  ]
    .filter(Boolean)
    .join("\n");

  await sendGraphMail({
    to: [borrower],
    cc: teacher ? [teacher] : [],
    bcc: opsBccRecipient(),
    subject,
    textBody: body,
  });

  return { skipped: false as const };
}

export async function notifyLoanRejected(input: LoanRejectedInput) {
  const borrower = recipientFromUser(input.borrower);
  if (!borrower) return { skipped: true as const };

  const subject = `Ausleihe abgelehnt (Anfrage ${input.loanId})`;
  const body = [
    makeGreeting(input.borrower.name),
    "",
    "Leider wurde deine Ausleihe abgelehnt.",
    "",
    "Wenn du Anpassungen vorschlagen willst, melde dich bitte im Schul-Lager.",
  ].join("\n");

  await sendGraphMail({
    to: [borrower],
    bcc: opsBccRecipient(),
    subject,
    textBody: body,
  });

  return { skipped: false as const };
}

export async function notifyLoanHandoverConfirmed(input: LoanHandoverConfirmedInput) {
  const borrower = recipientFromUser(input.borrower);
  if (!borrower) return { skipped: true as const };

  const subject = `Ausleihe uebergeben (Anfrage ${input.loanId})`;
  const body = [
    makeGreeting(input.borrower.name),
    "",
    "Wir haben dir folgende Artikel uebergeben.",
    "",
    ...input.items.map((item) => {
      const unitLine = item.unit?.trim() ? ` ${item.unit}` : "";
      const quantity = valueToText(item.quantity) || "?";
      const duePart = item.dueAt ? ` | Faellig am ${formatDate(item.dueAt)}` : "";
      return `- ${item.name}: Menge ${quantity}${unitLine}${duePart}`;
    }),
    "",
    "Bitte bring die Artikel rechtzeitig zurueck.",
  ].join("\n");

  await sendGraphMail({
    to: [borrower],
    bcc: opsBccRecipient(),
    subject,
    textBody: body,
  });

  return { skipped: false as const };
}

export async function notifyLoanReturned(input: LoanReturnedInput) {
  const borrower = recipientFromUser(input.borrower);
  if (!borrower) return { skipped: true as const };

  const subject = `Ausleihe zurueckgegeben (Anfrage ${input.loanId})`;
  const body = [
    makeGreeting(input.borrower.name),
    "",
    "Wir haben die Rueckgabe verbucht.",
    "",
    ...formatLineItems(input.items),
    "",
    "Danke!",
  ].join("\n");

  await sendGraphMail({
    to: [borrower],
    bcc: opsBccRecipient(),
    subject,
    textBody: body,
  });

  return { skipped: false as const };
}

export async function sendLoanReminder(input: LoanReminderInput) {
  const borrower = recipientFromUser(input.borrower);
  if (!borrower) return { skipped: true as const };

  const now = new Date();
  const daysSinceBorrowed = Math.max(0, floorDaysBetween(input.borrowedAt, now));

  const dueText = input.dueAt ? `Faellig am ${formatDate(input.dueAt)}.` : "";
  const overdue = input.dueAt ? now.getTime() > input.dueAt.getTime() : false;
  const overdueText = overdue ? `Du bist aktuell ueberfaellig.` : `Bitte halte die Rueckgabe im Blick.`;

  const subject = `Erinnerung: ${input.itemName}`;
  const body = [
    makeGreeting(input.borrower.name),
    "",
    `Du hast „${input.itemName}“ seit ${daysSinceBorrowed} Tagen.`,
    overdueText,
    dueText,
    "",
    "Bitte bring den Artikel so bald wie moeglich zurueck.",
  ]
    .filter(Boolean)
    .join("\n");

  await sendGraphMail({
    to: [borrower],
    bcc: opsBccRecipient(),
    subject,
    textBody: body,
  });

  return { skipped: false as const };
}

