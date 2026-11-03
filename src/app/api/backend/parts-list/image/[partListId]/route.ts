import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { db } from "~/server/db";

function sanitizePartListId(rawId: string): string {
  return rawId.trim().replace(/[^A-Za-z0-9_-]+/g, "");
}

export async function GET(_request: Request, context: { params: Promise<{ partListId: string }> }) {
  try {
    const { partListId: rawPartListId } = await context.params;
    const partListId = sanitizePartListId(rawPartListId);
    if (!partListId) {
      return NextResponse.json({ message: "Teilelisten-ID ist ungültig." }, { status: 400 });
    }

    const partList = await db.partList.findUnique({
      where: { id: partListId },
      select: { id: true, imageUrl: true },
    });
    if (!partList?.imageUrl) {
      return NextResponse.json({ message: "Bild nicht gefunden." }, { status: 404 });
    }

    const uploadDir = path.join(process.cwd(), "public", "data", "uploads", "parts-lists", "images", partListId);
    const files = await readdir(uploadDir).catch(() => []);
    const imageFile = files.find((entry) => entry.toLowerCase().startsWith("cover."));
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
