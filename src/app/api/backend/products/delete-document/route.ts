import { rm } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { db } from "~/server/db";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { documentId?: string } | null;
    const documentId = body?.documentId?.trim();
    if (!documentId) {
      return NextResponse.json({ message: "Dokumenten-ID fehlt." }, { status: 400 });
    }

    const document = await db.productDocument.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        productId: true,
        fileName: true,
      },
    });
    if (!document) {
      return NextResponse.json({ message: "Dokument wurde nicht gefunden." }, { status: 404 });
    }

    const outputPath = path.join(
      process.cwd(),
      "public",
      "data",
      "uploads",
      "documents",
      "products",
      document.productId,
      document.fileName,
    );

    await Promise.all([
      db.productDocument.delete({
        where: { id: document.id },
        select: { id: true },
      }),
      rm(outputPath, { force: true }),
    ]);

    return NextResponse.json({ ok: true as const });
  } catch {
    return NextResponse.json({ message: "Dokument konnte nicht gelöscht werden." }, { status: 500 });
  }
}
