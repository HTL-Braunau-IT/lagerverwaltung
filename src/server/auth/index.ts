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

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
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
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, profile, account }) {
      const userByEmail = user.email
        ? await db.user.findUnique({
            where: { email: user.email },
            select: { id: true },
          })
        : null;

      if (userByEmail && account?.provider && account.providerAccountId) {
        await db.account.upsert({
          where: {
            provider_providerAccountId: {
              provider: account.provider,
              providerAccountId: account.providerAccountId,
            },
          },
          update: {
            userId: userByEmail.id,
            access_token: account.access_token ?? null,
            refresh_token: account.refresh_token ?? null,
            id_token: account.id_token ?? null,
            scope: account.scope ?? null,
            token_type: account.token_type ?? null,
            expires_at: account.expires_at ?? null,
            session_state:
              typeof account.session_state === "string" ? account.session_state : null,
          },
          create: {
            userId: userByEmail.id,
            type: account.type,
            provider: account.provider,
            providerAccountId: account.providerAccountId,
            access_token: account.access_token ?? null,
            refresh_token: account.refresh_token ?? null,
            id_token: account.id_token ?? null,
            scope: account.scope ?? null,
            token_type: account.token_type ?? null,
            expires_at: account.expires_at ?? null,
            session_state:
              typeof account.session_state === "string" ? account.session_state : null,
          },
        });
      }

      const idTokenClaims = decodeJwtPayload(account?.id_token);
      const groups = extractGroupsFromClaims(profile, idTokenClaims);
      const azureAdObjectId = extractAzureObjectId(profile, idTokenClaims);
      const hasGroupOverage = hasGroupOverageClaim(idTokenClaims);
      let role: AppRole | null = resolveRoleFromGroups(groups);
      let roleSource: "token" | "graph-fallback" | "none" = "none";
      if (role) roleSource = "token";
      if (!user.email) {
        return false;
      }

      if (!role && azureAdObjectId && (hasGroupOverage || groups.length === 0)) {
        try {
          role = await resolveRoleFromGraphMembership(azureAdObjectId);
          if (role) {
            roleSource = "graph-fallback";
          }
        } catch (error) {
          console.warn("[auth] Graph-Fallback zur Rollenaufloesung fehlgeschlagen", {
            email: user.email,
            azureAdObjectId,
            reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
            hasGroupOverage,
            groupsInToken: groups.length,
          });
        }
      }

      if (!role) {
        console.warn("[auth] Keine passende Rollen-Gruppe gefunden", {
          email: user.email,
          groupsInToken: groups.length,
          hasGroupOverage,
          attemptedGraphFallback: Boolean(azureAdObjectId && (hasGroupOverage || groups.length === 0)),
        });
        // Do not block sign-in here, otherwise account linking/user creation can fail.
        // Access control is enforced by app role checks in server procedures/routes.
        return true;
      }

      await db.user.updateMany({
        where: { email: user.email },
        data: { role, emailVerified: new Date(), azureAdObjectId },
      });

      console.info("[auth] Rolle zugewiesen", {
        email: user.email,
        role,
        source: roleSource,
        groupsInToken: groups.length,
        hasGroupOverage,
      });

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
};

export const auth = () => getServerSession(authOptions);
