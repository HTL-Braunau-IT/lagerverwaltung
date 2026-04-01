import { env } from "~/env";
import {
  buildEmailTemplate,
  emailItemList,
  emailMetaList,
  emailSection,
  emailSectionTitle,
  emailStatusBadge,
  htmlToText,
} from "~/server/mail/email-template";
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
  if (items.length === 0) return ["(keine Positionen uebergeben)"];
  return items.map((item) => {
    const quantity = valueToText(item.quantity) || "?";
    const unit = item.unit?.trim() ? ` ${item.unit}` : "";
    return `${item.name}: Menge ${quantity}${unit}`;
  });
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: undefined }).format(value);
}

function floorDaysBetween(a: Date, b: Date) {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function buildLoanEmail(input: {
  title: string;
  intro: string[];
  status?: { label: string; tone: "primary" | "success" | "destructive" };
  metaRows?: Array<{ label: string; value: string }>;
  itemsTitle?: string;
  items?: string[];
  footer?: string[];
}) {
  const sections: string[] = [];
  if (input.status) {
    sections.push(emailSection(`${emailSectionTitle("Status")}${emailStatusBadge(input.status.label, input.status.tone)}`));
  }
  if (input.metaRows && input.metaRows.length > 0) {
    sections.push(emailSection(`${emailSectionTitle("Details")}${emailMetaList(input.metaRows)}`));
  }
  if (input.itemsTitle) {
    sections.push(emailSection(`${emailSectionTitle(input.itemsTitle)}${emailItemList(input.items ?? [])}`));
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

export async function notifyLoanApproved(input: LoanApprovedInput) {
  const borrower = recipientFromUser(input.borrower);
  if (!borrower) return { skipped: true as const };

  const teacher = input.teacher ? recipientFromUser(input.teacher) : null;
  const subject = `Freigegeben (Anfrage ${input.loanId})`;
  const mail = buildLoanEmail({
    title: `Anfrage ${input.loanId} freigegeben`,
    intro: [makeGreeting(input.borrower.name), "dein Anfrage wurde freigegeben."],
    status: { label: "Freigegeben", tone: "success" },
    metaRows: teacher ? [{ label: "Lehrperson", value: teacher.name ?? "-" }] : [],
    itemsTitle: "Artikel",
    items: formatLineItems(input.items),
    footer: ["Du bekommst weitere Updates, wenn sich der Status aendert."],
  });

  await sendGraphMail({
    to: [borrower],
    cc: teacher ? [teacher] : [],
    bcc: opsBccRecipient(),
    subject,
    htmlBody: mail.htmlBody,
    textFallback: mail.textFallback,
  });

  return { skipped: false as const };
}

export async function notifyLoanRejected(input: LoanRejectedInput) {
  const borrower = recipientFromUser(input.borrower);
  if (!borrower) return { skipped: true as const };

  const subject = `Anfrage abgelehnt (Anfrage ${input.loanId})`;
  const mail = buildLoanEmail({
    title: `Anfrage ${input.loanId} abgelehnt`,
    intro: [makeGreeting(input.borrower.name), "leider wurde deine Anfrage abgelehnt."],
    status: { label: "Abgelehnt", tone: "destructive" },
    footer: ["Wenn du Anpassungen vorschlagen willst, melde dich bitte im Schul-Lager."],
  });

  await sendGraphMail({
    to: [borrower],
    bcc: opsBccRecipient(),
    subject,
    htmlBody: mail.htmlBody,
    textFallback: mail.textFallback,
  });

  return { skipped: false as const };
}

export async function notifyLoanHandoverConfirmed(input: LoanHandoverConfirmedInput) {
  const borrower = recipientFromUser(input.borrower);
  if (!borrower) return { skipped: true as const };

  const subject = `Werkzeug uebergeben (Anfrage ${input.loanId})`;
  const items = input.items.map((item) => {
    const unitLine = item.unit?.trim() ? ` ${item.unit}` : "";
    const quantity = valueToText(item.quantity) || "?";
    const duePart = item.dueAt ? ` | Faellig am ${formatDate(item.dueAt)}` : "";
    return `${item.name}: Menge ${quantity}${unitLine}${duePart}`;
  });
  const mail = buildLoanEmail({
    title: `Werkzeug ${input.loanId} uebergeben`,
    intro: [makeGreeting(input.borrower.name), "wir haben dir folgende Artikel uebergeben."],
    status: { label: "Uebergeben", tone: "primary" },
    itemsTitle: "Ausgeliehene Artikel",
    items,
    footer: ["Bitte bring die Artikel rechtzeitig zurueck."],
  });

  await sendGraphMail({
    to: [borrower],
    bcc: opsBccRecipient(),
    subject,
    htmlBody: mail.htmlBody,
    textFallback: mail.textFallback,
  });

  return { skipped: false as const };
}

export async function notifyLoanReturned(input: LoanReturnedInput) {
  const borrower = recipientFromUser(input.borrower);
  if (!borrower) return { skipped: true as const };

  const subject = `Werkzeug zurueckgegeben (Anfrage ${input.loanId})`;
  const mail = buildLoanEmail({
    title: `Werkzeug ${input.loanId} zurueckgegeben`,
    intro: [makeGreeting(input.borrower.name), "wir haben die Rueckgabe verbucht."],
    status: { label: "Zurueckgegeben", tone: "success" },
    itemsTitle: "Rueckgegebene Artikel",
    items: formatLineItems(input.items),
    footer: ["Danke!"],
  });

  await sendGraphMail({
    to: [borrower],
    bcc: opsBccRecipient(),
    subject,
    htmlBody: mail.htmlBody,
    textFallback: mail.textFallback,
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
  const mail = buildLoanEmail({
    title: `Erinnerung zu ${input.itemName}`,
    intro: [
      makeGreeting(input.borrower.name),
      `Du hast "${input.itemName}" seit ${daysSinceBorrowed} Tagen.`,
      overdueText,
      ...(dueText ? [dueText] : []),
    ],
    status: { label: overdue ? "Ueberfaellig" : "Erinnerung", tone: overdue ? "destructive" : "primary" },
    footer: ["Bitte bring den Artikel so bald wie moeglich zurueck."],
  });

  await sendGraphMail({
    to: [borrower],
    bcc: opsBccRecipient(),
    subject,
    htmlBody: mail.htmlBody,
    textFallback: mail.textFallback,
  });

  return { skipped: false as const };
}

