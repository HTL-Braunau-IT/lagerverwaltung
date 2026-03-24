import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { db } from "~/server/db";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const allowedMimeToExt: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function sanitizePartListId(rawId: string): string {
  return rawId.trim().replace(/[^A-Za-z0-9_-]+/g, "");
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const partListIdValue = formData.get("partListId");
    const fileValue = formData.get("file");

    if (typeof partListIdValue !== "string" || partListIdValue.trim().length === 0) {
      return NextResponse.json({ message: "Teilelisten-ID fehlt." }, { status: 400 });
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

    const partListId = sanitizePartListId(partListIdValue);
    if (!partListId) {
      return NextResponse.json({ message: "Teilelisten-ID ist ungueltig." }, { status: 400 });
    }

    const partList = await db.partList.findUnique({
      where: { id: partListId },
      select: { id: true },
    });
    if (!partList) {
      return NextResponse.json({ message: "Teileliste wurde nicht gefunden." }, { status: 404 });
    }

    const ext = allowedMimeToExt[fileValue.type];
    if (!ext) {
      return NextResponse.json(
        { message: "Dateityp nicht erlaubt. Bitte JPG, PNG, WEBP oder GIF verwenden." },
        { status: 400 },
      );
    }

    const uploadDir = path.join(process.cwd(), "public", "data", "uploads", "parts-lists", "images", partListId);
    await mkdir(uploadDir, { recursive: true });

    const existingFiles = await readdir(uploadDir);
    await Promise.all(
      existingFiles
        .filter((entry) => entry.toLowerCase().startsWith("cover."))
        .map((entry) => rm(path.join(uploadDir, entry), { force: true })),
    );

    const filename = `cover.${ext}`;
    const outputPath = path.join(uploadDir, filename);
    const buffer = Buffer.from(await fileValue.arrayBuffer());
    await writeFile(outputPath, buffer);

    const url = `/data/uploads/parts-lists/images/${partListId}/${filename}`;
    await db.partList.update({
      where: { id: partListId },
      data: { imageUrl: url },
      select: { id: true },
    });

    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ message: "Bild konnte nicht gespeichert werden." }, { status: 500 });
  }
}
