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

function sanitizeProductId(rawId: string): string {
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
    const productIdValue = formData.get("productId");
    const fileValue = formData.get("file");

    if (typeof productIdValue !== "string" || productIdValue.trim().length === 0) {
      return NextResponse.json({ message: "Produkt-ID fehlt." }, { status: 400 });
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

    const productId = sanitizeProductId(productIdValue);
    if (!productId) {
      return NextResponse.json({ message: "Produkt-ID ist ungültig." }, { status: 400 });
    }

    const product = await db.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      return NextResponse.json({ message: "Produkt wurde nicht gefunden." }, { status: 404 });
    }

    const parsed = splitFileName(fileValue.name || "dokument");
    const sanitizedBase = sanitizeBaseName(parsed.base) || "dokument";
    const sanitizedExt = sanitizeBaseName(parsed.ext.toLowerCase());

    const uploadDir = path.join(process.cwd(), "public", "data", "uploads", "documents", "products", productId);
    await mkdir(uploadDir, { recursive: true });

    let fileName = formatStoredName(sanitizedBase, sanitizedExt);
    let counter = 1;
    while (true) {
      const existing = await db.productDocument.findUnique({
        where: {
          productId_fileName: {
            productId,
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

    const createdDocument = await db.productDocument.create({
      data: {
        productId,
        fileName,
        originalName: fileValue.name || fileName,
        url: "",
        mimeType: fileValue.type || "application/octet-stream",
        sizeBytes: fileValue.size,
      },
      select: { id: true },
    });
    const url = `/api/backend/products/document/${createdDocument.id}`;

    const document = await db.productDocument.update({
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
