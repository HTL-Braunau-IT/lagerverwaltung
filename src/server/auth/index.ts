import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { getServerSession, type NextAuthOptions } from "next-auth";
import AzureAD from "next-auth/providers/azure-ad";

import { env } from "~/env";
import { resolveRoleFromGraphMembership } from "~/server/graph/user-role";
import { db } from "~/server/db";

const roleByGroup = {
  ADMIN: env.ROLE_ADMIN_GROUP_ID,
  TEACHER: env.ROLE_TEACHER_GROUP_ID,
  STUDENT: env.ROLE_STUDENT_GROUP_ID,
} as const;

type AppRole = "ADMIN" | "TEACHER" | "STUDENT";
type RoleSource = "token" | "graph-fallback" | "none";

const resolveRoleFromGroups = (groups: unknown): "ADMIN" | "TEACHER" | "STUDENT" | null => {
  if (!Array.isArray(groups)) return null;
  const set = new Set(groups.filter((group): group is string => typeof group === "string"));
  if (set.has(roleByGroup.ADMIN)) return "ADMIN";
  if (set.has(roleByGroup.TEACHER)) return "TEACHER";
  if (set.has(roleByGroup.STUDENT)) return "STUDENT";
  return null;
};

const decodeJwtPayload = (token: string | null | undefined): Record<string, unknown> | null => {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const payload = parts[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
    return typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const extractGroupsFromClaims = (
  profile: unknown,
  idTokenClaims: Record<string, unknown> | null,
): string[] => {
  const fromProfile = (profile as { groups?: unknown } | undefined)?.groups;
  if (Array.isArray(fromProfile)) {
    return fromProfile.filter((group): group is string => typeof group === "string");
  }

  const fromIdToken = idTokenClaims?.groups;
  if (Array.isArray(fromIdToken)) {
    return fromIdToken.filter((group): group is string => typeof group === "string");
  }

  return [];
};

const extractAzureObjectId = (
  profile: unknown,
  idTokenClaims: Record<string, unknown> | null,
): string | null => {
  const fromProfile = (profile as { oid?: unknown } | undefined)?.oid;
  if (typeof fromProfile === "string" && fromProfile.trim().length > 0) {
    return fromProfile.trim();
  }

  const fromClaims = idTokenClaims?.oid;
  if (typeof fromClaims === "string" && fromClaims.trim().length > 0) {
    return fromClaims.trim();
  }

  const fromSub = idTokenClaims?.sub;
  if (typeof fromSub === "string" && fromSub.trim().length > 0) {
    return fromSub.trim();
  }

  return null;
};

const hasGroupOverageClaim = (idTokenClaims: Record<string, unknown> | null): boolean => {
  const claimNames = idTokenClaims?._claim_names;
  return (
    typeof claimNames === "object" &&
    claimNames !== null &&
    "groups" in claimNames
  );
};

const resolveRoleAndAzureMetadata = async ({
  profile,
  account,
  emailForLogs,
}: {
  profile: unknown;
  account: { id_token?: string | null } | null | undefined;
  emailForLogs: string | null;
}): Promise<{
  role: AppRole | null;
  roleSource: RoleSource;
  groupsInToken: number;
  hasGroupOverage: boolean;
  azureAdObjectId: string | null;
  attemptedGraphFallback: boolean;
}> => {
  const idTokenClaims = decodeJwtPayload(account?.id_token);
  const groups = extractGroupsFromClaims(profile, idTokenClaims);
  const azureAdObjectId = extractAzureObjectId(profile, idTokenClaims);
  const hasGroupOverage = hasGroupOverageClaim(idTokenClaims);

  let role: AppRole | null = resolveRoleFromGroups(groups);
  let roleSource: RoleSource = role ? "token" : "none";
  const attemptedGraphFallback = Boolean(azureAdObjectId && (hasGroupOverage || groups.length === 0));

  if (!role && attemptedGraphFallback && azureAdObjectId) {
    try {
      role = await resolveRoleFromGraphMembership(azureAdObjectId);
      if (role) {
        roleSource = "graph-fallback";
      }
    } catch (error) {
      console.warn("[auth] Graph-Fallback zur Rollenauflösung fehlgeschlagen", {
        email: emailForLogs,
        azureAdObjectId,
        reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        hasGroupOverage,
        groupsInToken: groups.length,
      });
    }
  }

  return {
    role,
    roleSource,
    groupsInToken: groups.length,
    hasGroupOverage,
    azureAdObjectId,
    attemptedGraphFallback,
  };
};

const prismaAdapter = PrismaAdapter(db);

export const authOptions: NextAuthOptions = {
  adapter: {
    ...prismaAdapter,
    // Teachers can be provisioned from the Entra directory before their first login (Freigabegruppen).
    // Match them case-insensitively so the Azure account links to the existing user.
    getUserByEmail: async (email) => {
      const user = await db.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
      });
      return user as Awaited<ReturnType<NonNullable<typeof prismaAdapter.getUserByEmail>>>;
    },
  },
  session: { strategy: "database" },
  providers: [
    AzureAD({
      clientId: env.AZURE_AD_CLIENT_ID,
      clientSecret: env.AZURE_AD_CLIENT_SECRET,
      tenantId: env.AZURE_AD_TENANT_ID,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope: "openid profile email offline_access User.Read",
          prompt: "select_account",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account && "ext_expires_in" in account) {
        delete (account as Record<string, unknown>).ext_expires_in;
      }
      if (!user.email) {
        console.warn("[auth] Sign-in abgelehnt: E-Mail fehlt", {
          provider: account?.provider ?? "unknown",
          hasUserId: Boolean(user.id),
        });
        return false;
      }
      return true;
    },
    session({ session, user }) {
      if (session.user) {
        const role = (user as { role?: "ADMIN" | "TEACHER" | "STUDENT" }).role;
        const azureAdObjectId = (user as { azureAdObjectId?: string | null }).azureAdObjectId;
        session.user.id = user.id;
        session.user.role = role ?? "STUDENT";
        session.user.azureAdObjectId = azureAdObjectId ?? null;
      }
      return session;
    },
  },
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      if (!user.id) {
        console.warn("[auth] Sign-in Event ohne user.id", {
          provider: account?.provider ?? "unknown",
          email: user.email ?? null,
          isNewUser,
        });
        return;
      }

      const roleData = await resolveRoleAndAzureMetadata({
        profile,
        account,
        emailForLogs: user.email ?? null,
      });

      const data: {
        emailVerified: Date;
        role?: AppRole;
        azureAdObjectId?: string;
      } = {
        emailVerified: new Date(),
      };

      if (roleData.role) {
        data.role = roleData.role;
      }
      if (roleData.azureAdObjectId) {
        data.azureAdObjectId = roleData.azureAdObjectId;
      }

      await db.user.update({
        where: { id: user.id },
        data,
      });

      if (!roleData.role) {
        console.warn("[auth] Keine passende Rollen-Gruppe gefunden", {
          provider: account?.provider ?? "unknown",
          userId: user.id,
          email: user.email ?? null,
          isNewUser,
          groupsInToken: roleData.groupsInToken,
          hasGroupOverage: roleData.hasGroupOverage,
          attemptedGraphFallback: roleData.attemptedGraphFallback,
        });
        return;
      }

      console.info("[auth] Rolle zugewiesen", {
        provider: account?.provider ?? "unknown",
        userId: user.id,
        email: user.email ?? null,
        isNewUser,
        role: roleData.role,
        source: roleData.roleSource,
        groupsInToken: roleData.groupsInToken,
        hasGroupOverage: roleData.hasGroupOverage,
      });
    },
  },
};

export const auth = () => getServerSession(authOptions);
