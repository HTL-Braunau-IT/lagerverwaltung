import { NextResponse } from "next/server";

import { env } from "~/env";
import { db } from "~/server/db";
import { auth } from "~/server/auth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const returnTo = url.searchParams.get("returnTo") ?? "/";

  const postLogoutRedirectUri = new URL(returnTo, env.AUTH_URL).toString();
  const microsoftLogoutUrl = new URL(
    `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/oauth2/v2.0/logout`,
  );
  microsoftLogoutUrl.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);

  // Reduce Microsoft "choose an account to sign out" prompts when possible.
  const session = await auth();
  const email = session?.user?.email ?? null;

  if (email) {
    microsoftLogoutUrl.searchParams.set("logout_hint", email);
  }

  if (session?.user?.id) {
    const account = await db.account.findFirst({
      where: { userId: session.user.id, provider: "azure-ad" },
      select: { id_token: true },
      orderBy: { id: "desc" },
    });

    if (account?.id_token) {
      microsoftLogoutUrl.searchParams.set("id_token_hint", account.id_token);
    }
  }

  return NextResponse.redirect(microsoftLogoutUrl);
}

