import { env } from "~/env";

export type TeacherDirectoryEntry = {
  externalId: string;
  displayName: string;
  email: string;
};

type GraphMember = {
  id?: unknown;
  displayName?: unknown;
  mail?: unknown;
  userPrincipalName?: unknown;
  "@odata.type"?: unknown;
};

const CACHE_TTL_MS = 60_000;

let cachedTeachers:
  | {
      expiresAt: number;
      values: TeacherDirectoryEntry[];
    }
  | null = null;

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function normalizeMember(member: GraphMember): TeacherDirectoryEntry | null {
  const odataType = asNonEmptyString(member["@odata.type"]);
  if (odataType.length > 0 && !odataType.toLowerCase().includes("user")) {
    return null;
  }

  const externalId = asNonEmptyString(member.id);
  if (externalId.length === 0) return null;

  const displayName = asNonEmptyString(member.displayName) || externalId;
  const email =
    asNonEmptyString(member.mail) ||
    asNonEmptyString(member.userPrincipalName) ||
    `${externalId}@unknown.local`;

  return {
    externalId,
    displayName,
    email: email.toLowerCase(),
  };
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
  const accessToken = asNonEmptyString(payload.access_token);
  if (accessToken.length === 0) {
    throw new Error("GRAPH_TOKEN_MISSING");
  }

  return accessToken;
}

export async function listTeachersFromGraph(
  options?: { forceRefresh?: boolean },
): Promise<TeacherDirectoryEntry[]> {
  const now = Date.now();
  if (!options?.forceRefresh && cachedTeachers && cachedTeachers.expiresAt > now) {
    return cachedTeachers.values;
  }

  const accessToken = await getGraphAccessToken();
  const initialUrl = new URL(
    `https://graph.microsoft.com/v1.0/groups/${env.ROLE_TEACHER_GROUP_ID}/transitiveMembers/microsoft.graph.user`,
  );
  initialUrl.searchParams.set(
    "$select",
    "id,displayName,mail,userPrincipalName,onPremisesSamAccountName,employeeId",
  );
  initialUrl.searchParams.set("$top", "999");

  const collected = new Map<string, TeacherDirectoryEntry>();
  let nextUrl: string | null = initialUrl.toString();

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        // Needed for advanced directory queries with transitive members in larger tenants.
        consistencyLevel: "eventual",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`GRAPH_TEACHER_LIST_FAILED:${response.status}`);
    }

    const payload = (await response.json()) as {
      value?: unknown;
      "@odata.nextLink"?: unknown;
    };
    const values = Array.isArray(payload.value) ? payload.value : [];

    for (const value of values) {
      const normalized = normalizeMember((value ?? {}) as GraphMember);
      if (!normalized) continue;
      collected.set(normalized.externalId, normalized);
    }

    const maybeNext = asNonEmptyString(payload["@odata.nextLink"]);
    nextUrl = maybeNext.length > 0 ? maybeNext : null;
  }

  const teachers = [...collected.values()];
  teachers.sort((a, b) => {
    const name = a.displayName.localeCompare(b.displayName, "de-AT");
    if (name !== 0) return name;
    return a.email.localeCompare(b.email, "de-AT");
  });

  cachedTeachers = {
    expiresAt: now + CACHE_TTL_MS,
    values: teachers,
  };

  return teachers;
}
