import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { db } from "~/server/db";

function sanitizeDocumentId(rawId: string): string {
  return rawId.trim().replace(/[^A-Za-z0-9_-]+/g, "");
}

export async function GET(_request: Request, context: { params: Promise<{ documentId: string }> }) {
  try {
    const { documentId: rawDocumentId } = await context.params;
    const documentId = sanitizeDocumentId(rawDocumentId);
    if (!documentId) {
      return NextResponse.json({ message: "Dokumenten-ID ist ungueltig." }, { status: 400 });
    }

    const document = await db.partListDocument.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        partListId: true,
        fileName: true,
        mimeType: true,
      },
    });
    if (!document) {
      return NextResponse.json({ message: "Dokument nicht gefunden." }, { status: 404 });
    }

    const filePath = path.join(
      process.cwd(),
      "public",
      "data",
      "uploads",
      "documents",
      document.partListId,
      document.fileName,
    );
    const bytes = await readFile(filePath);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": document.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${document.fileName}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ message: "Dokument konnte nicht geladen werden." }, { status: 500 });
  }
}
