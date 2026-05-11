import { NextResponse } from "next/server";

import { env } from "~/env";

export function GET(req: Request) {
  const url = new URL(req.url);
  const returnTo = url.searchParams.get("returnTo") ?? "/";

  const postLogoutRedirectUri = new URL(returnTo, env.AUTH_URL).toString();
  const microsoftLogoutUrl = new URL(
    `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/oauth2/v2.0/logout`,
  );
  microsoftLogoutUrl.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);

  return NextResponse.redirect(microsoftLogoutUrl);
}

