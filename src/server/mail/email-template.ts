type EmailPalette = {
  background: string;
  card: string;
  border: string;
  text: string;
  mutedText: string;
  primary: string;
  primaryText: string;
  success: string;
  successText: string;
  destructive: string;
  destructiveText: string;
};

const palette: EmailPalette = {
  background: "#f3f5f9",
  card: "#ffffff",
  border: "#d9dfea",
  text: "#1d2433",
  mutedText: "#5f6b85",
  primary: "#3f63f5",
  primaryText: "#ffffff",
  success: "#198754",
  successText: "#ffffff",
  destructive: "#d84c3f",
  destructiveText: "#ffffff",
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function emailText(value: string | null | undefined) {
  return escapeHtml((value ?? "").trim());
}

export function emailParagraph(value: string) {
  return `<p style="margin:0 0 12px 0;color:${palette.text};font-size:15px;line-height:1.55;">${emailText(value)}</p>`;
}

export function emailMutedParagraph(value: string) {
  return `<p style="margin:0 0 12px 0;color:${palette.mutedText};font-size:14px;line-height:1.55;">${emailText(value)}</p>`;
}

export function emailSectionTitle(value: string) {
  return `<p style="margin:0 0 10px 0;color:${palette.text};font-size:13px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;">${emailText(value)}</p>`;
}

export function emailStatusBadge(
  value: string,
  tone: "primary" | "success" | "destructive" = "primary",
) {
  const background =
    tone === "success" ? palette.success : tone === "destructive" ? palette.destructive : palette.primary;
  const text =
    tone === "success"
      ? palette.successText
      : tone === "destructive"
        ? palette.destructiveText
        : palette.primaryText;

  return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${background};color:${text};font-size:12px;font-weight:700;letter-spacing:.02em;">${emailText(value)}</span>`;
}

export function emailMetaList(rows: Array<{ label: string; value: string }>) {
  if (rows.length === 0) return "";
  const body = rows
    .map(
      (row) =>
        `<tr>
  <td style="padding:6px 0;color:${palette.mutedText};font-size:14px;vertical-align:top;width:170px;">${emailText(row.label)}</td>
  <td style="padding:6px 0;color:${palette.text};font-size:14px;vertical-align:top;font-weight:600;">${emailText(row.value)}</td>
</tr>`,
    )
    .join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 14px 0;">${body}</table>`;
}

export function emailItemList(items: string[]) {
  if (items.length === 0) {
    return `<p style="margin:0;color:${palette.mutedText};font-size:14px;line-height:1.55;">(keine Positionen übergeben)</p>`;
  }

  const body = items
    .map(
      (item) =>
        `<tr><td style="padding:8px 0;border-top:1px solid ${palette.border};color:${palette.text};font-size:14px;line-height:1.45;">${emailText(item)}</td></tr>`,
    )
    .join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0;">${body}</table>`;
}

export function emailButton(label: string, href: string) {
  return `<p style="margin:0 0 16px 0;"><a href="${emailText(href)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:${palette.primary};color:${palette.primaryText};font-size:14px;font-weight:700;text-decoration:none;">${emailText(label)}</a></p>`;
}

export function emailSection(innerHtml: string) {
  return `<div style="margin:0 0 16px 0;padding:14px;border:1px solid ${palette.border};border-radius:10px;background:${palette.card};">${innerHtml}</div>`;
}

type BuildEmailTemplateInput = {
  preheader?: string;
  title: string;
  intro?: string[];
  sections?: string[];
  footer?: string[];
};

export function buildEmailTemplate(input: BuildEmailTemplateInput) {
  const intro = (input.intro ?? []).map(emailParagraph).join("");
  const sections = (input.sections ?? []).join("");
  const footer = (input.footer ?? []).map(emailMutedParagraph).join("");
  const preheader = input.preheader?.trim() ? emailText(input.preheader) : "";

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="x-ua-compatible" content="ie=edge" />
  <title>${emailText(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:${palette.background};font-family:Inter,Segoe UI,Arial,sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>` : ""}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:${palette.background};padding:24px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="680" style="width:100%;max-width:680px;border-collapse:collapse;background:${palette.card};border:1px solid ${palette.border};border-radius:14px;">
          <tr>
            <td style="padding:24px;">
              <h1 style="margin:0 0 16px 0;color:${palette.text};font-size:24px;line-height:1.25;font-weight:800;">${emailText(input.title)}</h1>
              ${intro}
              ${sections}
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function htmlToText(html: string) {
  return html
    .replaceAll(/<style[\s\S]*?<\/style>/gi, "")
    .replaceAll(/<script[\s\S]*?<\/script>/gi, "")
    .replaceAll(/<br\s*\/?>/gi, "\n")
    .replaceAll(/<\/(p|div|tr|table|h1|h2|h3|li)>/gi, "\n")
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}
