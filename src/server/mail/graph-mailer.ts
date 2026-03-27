import { env } from "~/env";

export type MailRecipient = {
  email: string;
  name?: string | null;
};

type SendGraphMailInput = {
  to: MailRecipient[];
  cc?: MailRecipient[];
  bcc?: MailRecipient[];
  subject: string;
  htmlBody: string;
  textFallback?: string;
};

function toAddress(recipient: MailRecipient) {
  return {
    emailAddress: {
      address: recipient.email,
      ...(recipient.name ? { name: recipient.name } : {}),
    },
  };
}

function cleanRecipients(recipients: MailRecipient[] | undefined) {
  const values = recipients ?? [];
  return values
    .filter((entry) => typeof entry.email === "string" && entry.email.trim().length > 0)
    .map((entry) => ({ email: entry.email.trim(), name: entry.name?.trim() ?? undefined }));
}

async function getGraphAccessToken() {
  const tokenEndpoint = `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.AZURE_AD_CLIENT_ID,
    client_secret: env.AZURE_AD_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`GRAPH_TOKEN_REQUEST_FAILED:${response.status}`);
  }

  const payload = (await response.json()) as { access_token?: unknown };
  const accessToken = typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  if (!accessToken) {
    throw new Error("GRAPH_TOKEN_MISSING");
  }

  return accessToken;
}

export async function sendGraphMail(input: SendGraphMailInput) {
  if (!env.MAIL_FROM_ADDRESS) {
    throw new Error("MAIL_FROM_ADDRESS_MISSING");
  }

  const to = cleanRecipients(input.to);
  const cc = cleanRecipients(input.cc);
  const bcc = cleanRecipients(input.bcc);

  if (to.length === 0) {
    return { skipped: true as const, reason: "NO_RECIPIENTS" as const };
  }

  const accessToken = await getGraphAccessToken();
  const senderUserPath = encodeURIComponent(env.MAIL_FROM_ADDRESS);
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${senderUserPath}/sendMail`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: {
          contentType: "HTML",
          content: input.htmlBody,
        },
        toRecipients: to.map(toAddress),
        ccRecipients: cc.map(toAddress),
        bccRecipients: bcc.map(toAddress),
      },
      saveToSentItems: "true",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`GRAPH_SENDMAIL_FAILED:${response.status}:${details}`);
  }

  return { skipped: false as const };
}
