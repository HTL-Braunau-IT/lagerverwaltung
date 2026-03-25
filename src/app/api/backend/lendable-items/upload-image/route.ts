import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const allowedMimeToExt: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function sanitizeItemId(rawId: string): string {
  return rawId
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const itemIdValue = formData.get("itemId");
    const fileValue = formData.get("file");

    if (typeof itemIdValue !== "string" || itemIdValue.trim().length === 0) {
      return NextResponse.json({ message: "Artikel-ID fehlt." }, { status: 400 });
    }
    if (!(fileValue instanceof File)) {
      return NextResponse.json({ message: "Datei fehlt." }, { status: 400 });
    }
    if (fileValue.size <= 0) {
      return NextResponse.json({ message: "Datei ist leer." }, { status: 400 });
    }
    if (fileValue.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ message: "Datei zu gross. Maximal 8 MB erlaubt." }, { status: 400 });
    }

    const itemId = sanitizeItemId(itemIdValue);
    if (!itemId) {
      return NextResponse.json({ message: "Artikel-ID ist ungueltig." }, { status: 400 });
    }

    const ext = allowedMimeToExt[fileValue.type];
    if (!ext) {
      return NextResponse.json(
        { message: "Dateityp nicht erlaubt. Bitte JPG, PNG, WEBP oder GIF verwenden." },
        { status: 400 },
      );
    }

    const uploadDir = path.join(process.cwd(), "public", "data", "uploads", "lendable-items", itemId);
    await mkdir(uploadDir, { recursive: true });

    const existingFiles = await readdir(uploadDir);
    await Promise.all(
      existingFiles
        .filter((entry) => entry.toLowerCase().startsWith("img."))
        .map((entry) => rm(path.join(uploadDir, entry), { force: true })),
    );

    const filename = `img.${ext}`;
    const outputPath = path.join(uploadDir, filename);
    const buffer = Buffer.from(await fileValue.arrayBuffer());
    await writeFile(outputPath, buffer);

    return NextResponse.json({ url: `/api/backend/lendable-items/image/${itemId}` });
  } catch {
    return NextResponse.json({ message: "Bild konnte nicht gespeichert werden." }, { status: 500 });
  }
}

