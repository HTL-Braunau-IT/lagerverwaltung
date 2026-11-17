import { NextResponse } from "next/server";

import { env } from "~/env";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

/**
 * Liveness + database check, polled by the self-hosting update script
 * (self-hosting/lagershop-update.sh) before it accepts a new image.
 * Unauthenticated on purpose; returns no data beyond the running commit.
 */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", commit: env.APP_COMMIT });
  } catch (error) {
    // Name/code only: driver errors can echo connection details.
    const code =
      error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
    console.error(
      "[health] Datenbank nicht erreichbar:",
      error instanceof Error ? error.name : "unknown",
      code ?? "",
    );
    return NextResponse.json(
      { status: "error", message: "Datenbank nicht erreichbar" },
      { status: 503 },
    );
  }
}
