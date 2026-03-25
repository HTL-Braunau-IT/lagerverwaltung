import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { db } from "~/server/db";

function sanitizeItemId(rawId: string): string {
  return rawId.trim().replace(/[^A-Za-z0-9_-]+/g, "");
}

export async function GET(_request: Request, context: { params: Promise<{ itemId: string }> }) {
  try {
    const { itemId: rawItemId } = await context.params;
    const itemId = sanitizeItemId(rawItemId);
    if (!itemId) {
      return NextResponse.json({ message: "Artikel-ID ist ungueltig." }, { status: 400 });
    }

    const item = await db.lendableItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        images: {
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: { id: true },
        },
      },
    });
    if (!item || item.images.length === 0) {
      return NextResponse.json({ message: "Bild nicht gefunden." }, { status: 404 });
    }

    const uploadDir = path.join(process.cwd(), "public", "data", "uploads", "lendable-items", itemId);
    const files = await readdir(uploadDir).catch(() => []);
    const imageFile = files.find((entry) => entry.toLowerCase().startsWith("img."));
    if (!imageFile) {
      return NextResponse.json({ message: "Bild nicht gefunden." }, { status: 404 });
    }

    const filePath = path.join(uploadDir, imageFile);
    const bytes = await readFile(filePath);
    const ext = path.extname(imageFile).slice(1).toLowerCase();
    const mimeType =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "png"
          ? "image/png"
          : ext === "webp"
            ? "image/webp"
            : ext === "gif"
              ? "image/gif"
              : "application/octet-stream";

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ message: "Bild konnte nicht geladen werden." }, { status: 500 });
  }
}
