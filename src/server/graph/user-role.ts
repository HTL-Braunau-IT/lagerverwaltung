import { env } from "~/env";

type AppRole = "ADMIN" | "TEACHER" | "STUDENT";

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const REQUEST_TIMEOUT_MS = 10_000;

const roleByGroup: Record<AppRole, string> = {
  ADMIN: env.ROLE_ADMIN_GROUP_ID,
  TEACHER: env.ROLE_TEACHER_GROUP_ID,
  STUDENT: env.ROLE_STUDENT_GROUP_ID,
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

async function getGraphAccessToken(): Promise<string> {
  const tokenEndpoint = `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.AZURE_AD_CLIENT_ID,
    client_secret: env.AZURE_AD_CLIENT_SECRET,
    scope: GRAPH_SCOPE,
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`GRAPH_TOKEN_REQUEST_FAILED:${response.status}`);
  }

  const payload = (await response.json()) as { access_token?: unknown };
  if (!isNonEmptyString(payload.access_token)) {
    throw new Error("GRAPH_TOKEN_MISSING");
  }

  return payload.access_token.trim();
}

async function withTimeout<T>(
  runner: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await runner(controller.signal);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function checkMemberGroups(
  accessToken: string,
  userObjectId: string,
  groupIds: string[],
): Promise<Set<string>> {
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userObjectId)}/checkMemberGroups`;
  const response = await withTimeout(
    (signal) =>
      fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ groupIds }),
        cache: "no-store",
        signal,
      }),
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`GRAPH_CHECK_MEMBER_GROUPS_FAILED:${response.status}`);
  }

  const payload = (await response.json()) as { value?: unknown };
  const values = Array.isArray(payload.value) ? payload.value : [];
  const memberGroupIds = values.filter(isNonEmptyString).map((id) => id.trim());
  return new Set(memberGroupIds);
}

export async function resolveRoleFromGraphMembership(userObjectId: string): Promise<AppRole | null> {
  if (!isNonEmptyString(userObjectId)) return null;

  const accessToken = await getGraphAccessToken();
  const configuredGroupIds = [
    roleByGroup.ADMIN,
    roleByGroup.TEACHER,
    roleByGroup.STUDENT,
  ].filter(isNonEmptyString);
  if (configuredGroupIds.length === 0) return null;

  const memberGroupIds = await checkMemberGroups(accessToken, userObjectId.trim(), configuredGroupIds);
  if (memberGroupIds.has(roleByGroup.ADMIN)) return "ADMIN";
  if (memberGroupIds.has(roleByGroup.TEACHER)) return "TEACHER";
  if (memberGroupIds.has(roleByGroup.STUDENT)) return "STUDENT";
  return null;
}
