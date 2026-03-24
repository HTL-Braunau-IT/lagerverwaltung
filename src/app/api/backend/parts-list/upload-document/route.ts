import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { db } from "~/server/db";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const allowedMimeTypes = new Set([
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

function sanitizePartListId(rawId: string): string {
  return rawId.trim().replace(/[^A-Za-z0-9_-]+/g, "");
}

function sanitizeBaseName(name: string): string {
  return name
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function splitFileName(input: string): { base: string; ext: string } {
  const trimmed = input.trim();
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) {
    return { base: trimmed, ext: "" };
  }
  return {
    base: trimmed.slice(0, dotIndex),
    ext: trimmed.slice(dotIndex + 1).toLowerCase(),
  };
}

function formatStoredName(base: string, ext: string, suffix?: number): string {
  const stem = suffix ? `${base}-${suffix}` : base;
  return ext ? `${stem}.${ext}` : stem;
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
      return NextResponse.json({ message: "Datei zu gross. Maximal 12 MB erlaubt." }, { status: 400 });
    }
    if (!allowedMimeTypes.has(fileValue.type)) {
      return NextResponse.json({ message: "Dateityp nicht erlaubt." }, { status: 400 });
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

    const parsed = splitFileName(fileValue.name || "dokument");
    const sanitizedBase = sanitizeBaseName(parsed.base) || "dokument";
    const sanitizedExt = sanitizeBaseName(parsed.ext.toLowerCase());

    const uploadDir = path.join(process.cwd(), "public", "data", "uploads", "documents", partListId);
    await mkdir(uploadDir, { recursive: true });

    let fileName = formatStoredName(sanitizedBase, sanitizedExt);
    let counter = 1;
    while (true) {
      const existing = await db.partListDocument.findUnique({
        where: {
          partListId_fileName: {
            partListId,
            fileName,
          },
        },
        select: { id: true },
      });
      if (!existing) break;
      counter += 1;
      fileName = formatStoredName(sanitizedBase, sanitizedExt, counter);
    }

    const outputPath = path.join(uploadDir, fileName);
    const buffer = Buffer.from(await fileValue.arrayBuffer());
    await writeFile(outputPath, buffer);

    const createdDocument = await db.partListDocument.create({
      data: {
        partListId,
        fileName,
        originalName: fileValue.name || fileName,
        url: "",
        mimeType: fileValue.type || "application/octet-stream",
        sizeBytes: fileValue.size,
      },
      select: { id: true },
    });
    const url = `/api/backend/parts-list/document/${createdDocument.id}`;

    const document = await db.partListDocument.update({
      where: { id: createdDocument.id },
      data: { url },
      select: {
        id: true,
        fileName: true,
        originalName: true,
        url: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    });

    return NextResponse.json(document);
  } catch {
    return NextResponse.json({ message: "Dokument konnte nicht gespeichert werden." }, { status: 500 });
  }
}
