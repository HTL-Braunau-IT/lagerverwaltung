// Step 1 of the legacy import: read a VirtueMart catalog (MySQL + media folder) and write a
// self-contained, reviewable bundle (catalog.json + files/) for import-catalog-bundle.mjs.
// Nothing is written to the app database here.
//
// Usage:
//   LEGACY_DB_HOST=127.0.0.1 LEGACY_DB_USER=root LEGACY_DB_NAME=htlbr_clagerverw \
//   node scripts/extract-virtuemart-bundle.mjs \
//     --table-prefix a9o2u_ --media-dir ../chemie-legacy-export/media \
//     --out ../chemie-legacy-export/bundle \
//     --room Chemie --location-code chemie --location-name Chemie --sku-prefix CH- \
//     [--skip-category Alle] [--force-unit PCS] [--no-download-links]

import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import mysql from "mysql2/promise";

import {
  BUNDLE_VERSION,
  extractLinks,
  htmlToText,
  logStep,
  normalizeText,
  parseArgs,
  safeSegment,
  sanitizeFileBase,
  toNumber,
} from "./lib/catalog-bundle.mjs";

const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024; // matches the product document upload limit
const DOWNLOAD_TIMEOUT_MS = 30_000;
const DOWNLOAD_CONCURRENCY = 6;

const args = parseArgs(process.argv.slice(2));

/**
 * @param {string} name
 * @param {string} [fallback]
 */
function requireArg(name, fallback) {
  const value = args.get(name) ?? fallback;
  if (!value || value === "true") {
    throw new Error(`Missing required argument --${name}`);
  }
  return value;
}

const tablePrefix = requireArg("table-prefix", process.env.LEGACY_DB_PREFIX);
const mediaDir = path.resolve(
  requireArg("media-dir", process.env.LEGACY_MEDIA_DIR),
);
const outDir = path.resolve(requireArg("out"));
const storageRoom = requireArg("room");
const locationCode = requireArg("location-code");
const locationName = args.get("location-name") ?? storageRoom;
const skuPrefix = args.get("sku-prefix") ?? "";
const fallbackCategory = args.get("fallback-category") ?? "Allgemein";
const skippedCategoryNames = new Set(
  (args.get("skip-category") ?? "Alle")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);
const forceUnit = args.get("force-unit")?.toUpperCase();
const downloadLinks = !args.has("no-download-links");

if (!/^[A-Za-z0-9_]+$/.test(tablePrefix)) {
  throw new Error(
    "--table-prefix may only contain letters, digits and underscores",
  );
}
if (!existsSync(mediaDir)) {
  throw new Error(`--media-dir does not exist: ${mediaDir}`);
}

const legacyHost = process.env.LEGACY_DB_HOST;
const legacyUser = process.env.LEGACY_DB_USER;
const legacyDatabase = process.env.LEGACY_DB_NAME;
if (!legacyHost || !legacyUser || !legacyDatabase) {
  throw new Error(
    "Missing legacy DB env vars. Required: LEGACY_DB_HOST, LEGACY_DB_USER, LEGACY_DB_NAME",
  );
}

/** @param {string} table */
const t = (table) => `\`${tablePrefix}${table}\``;

/**
 * Legacy unit → app unit. `baseStep` scales the legacy packaging step into the base unit.
 * @type {Record<string, { unitKind: string, baseUnit: string, baseStep?: number }>}
 */
const UNIT_MAP = {
  pcs: { unitKind: "PIECE", baseUnit: "PCS" },
  stk: { unitKind: "PIECE", baseUnit: "PCS" },
  st: { unitKind: "PIECE", baseUnit: "PCS" },
  mm: { unitKind: "LENGTH", baseUnit: "MM" },
  cm: { unitKind: "LENGTH", baseUnit: "CM" },
  m: { unitKind: "LENGTH", baseUnit: "M" },
  g: { unitKind: "WEIGHT", baseUnit: "G" },
  kg: { unitKind: "WEIGHT", baseUnit: "KG" },
  ml: { unitKind: "VOLUME", baseUnit: "ML" },
  l: { unitKind: "VOLUME", baseUnit: "L" },
};

/** @type {Record<string, string>} */
const UNIT_KIND_BY_BASE = {
  PCS: "PIECE",
  MM: "LENGTH",
  CM: "LENGTH",
  M: "LENGTH",
  G: "WEIGHT",
  KG: "WEIGHT",
  ML: "VOLUME",
  L: "VOLUME",
};

if (forceUnit && !UNIT_KIND_BY_BASE[forceUnit]) {
  throw new Error(
    `--force-unit must be one of ${Object.keys(UNIT_KIND_BY_BASE).join(", ")}`,
  );
}

/** Integer-step units must have integer steps; fractional units use 0.001 resolution. */
/**
 * @param {string} baseUnit
 * @param {number} step
 */
function normalizeStep(baseUnit, step) {
  const safe = Number.isFinite(step) && step > 0 ? step : 1;
  if (baseUnit === "PCS") return String(Math.max(1, Math.round(safe)));
  return safe.toFixed(3);
}

const report = {
  productsTotal: 0,
  productsUnpublished: 0,
  productsExtracted: 0,
  skuEmpty: [],
  skuDuplicates: [],
  unitFallbacks: {},
  imagesCopied: 0,
  imagesMissing: [],
  documentsCopied: 0,
  documentsMissing: [],
  linksFound: 0,
  linkDownloadsOk: 0,
  linkDownloadsNotPdf: [],
  linkDownloadsFailed: [],
  productsWithoutCategory: [],
};

/**
 * Downloads a URL and returns the bytes if (and only if) it is a PDF.
 * @param {string} url
 * @returns {Promise<{ ok: true, bytes: Buffer } | { ok: false, reason: string }>}
 */
async function downloadPdf(url) {
  try {
    /** @type {Response | undefined} */
    let response;
    // Retry rate-limited responses (429/503), honouring Retry-After when present.
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; lagerverwaltung-import/1.0)",
          Accept: "application/pdf,*/*;q=0.8",
        },
      });
      if ((response.status !== 429 && response.status !== 503) || attempt === 4)
        break;
      const retryAfter = Number.parseInt(
        response.headers.get("retry-after") ?? "",
        10,
      );
      const waitMs = Math.min(
        60_000,
        Number.isFinite(retryAfter) ? retryAfter * 1000 : 5_000 * attempt,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    if (!response) return { ok: false, reason: "no response" };
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };
    const bytes = Buffer.from(await response.arrayBuffer());
    const isPdf = bytes.subarray(0, 5).toString("latin1") === "%PDF-";
    if (!isPdf) {
      return {
        ok: false,
        reason: `not a PDF (${response.headers.get("content-type") ?? "unknown type"})`,
      };
    }
    if (bytes.length > MAX_DOCUMENT_BYTES)
      return { ok: false, reason: `too large (${bytes.length} bytes)` };
    return { ok: true, bytes };
  } catch (error) {
    return { ok: false, reason: String(error) };
  }
}

/**
 * Runs `worker` over `items` with bounded concurrency.
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<void>} worker
 */
async function runPool(items, limit, worker) {
  let next = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const item = /** @type {T} */ (items[next]);
        next += 1;
        await worker(item);
      }
    },
  );
  await Promise.all(runners);
}

/**
 * Resolves a VirtueMart media path (relative to the Joomla root) inside mediaDir,
 * refusing anything that escapes it.
 * @param {unknown} filePath
 */
function resolveMediaFile(filePath) {
  const relative = decodeURIComponent(
    normalizeText(filePath).replace(/^https?:\/\/[^/]+/i, ""),
  ).replace(/^\/+/, "");
  if (!relative) return null;
  const resolved = path.resolve(mediaDir, relative);
  if (!resolved.startsWith(mediaDir + path.sep)) return null;
  return existsSync(resolved) ? resolved : null;
}

async function main() {
  logStep(`Connecting to legacy DB ${legacyHost}/${legacyDatabase}`);
  const conn = await mysql.createConnection({
    host: legacyHost,
    port: Number.parseInt(process.env.LEGACY_DB_PORT ?? "3306", 10),
    user: legacyUser,
    password: process.env.LEGACY_DB_PASSWORD,
    database: legacyDatabase,
    charset: "utf8mb4",
  });

  try {
    const [categoryRows] = /** @type {[any[], unknown]} */ (
      await conn.query(
        `SELECT c.virtuemart_category_id AS id, c.published, cd.category_name AS name
         FROM ${t("virtuemart_categories")} c
         LEFT JOIN ${t("virtuemart_categories_de_de")} cd USING (virtuemart_category_id)`,
      )
    );
    /** @type {Map<number, { name: string, published: boolean }>} */
    const categories = new Map();
    for (const row of categoryRows) {
      const name = normalizeText(row.name);
      if (!name || skippedCategoryNames.has(name.toLowerCase())) continue;
      categories.set(Number(row.id), {
        name,
        published: Number(row.published) === 1,
      });
    }

    const [productRows] = /** @type {[any[], unknown]} */ (
      await conn.query(
        `SELECT p.virtuemart_product_id AS id, p.product_sku AS sku, p.published,
                p.product_in_stock AS inStock, p.low_stock_notification AS lowStock,
                p.product_unit AS unit, p.product_packaging AS packaging,
                pd.product_name AS name, pd.product_desc AS descr, pd.product_s_desc AS shortDescr
         FROM ${t("virtuemart_products")} p
         LEFT JOIN ${t("virtuemart_products_de_de")} pd USING (virtuemart_product_id)
         ORDER BY p.virtuemart_product_id ASC`,
      )
    );

    const [priceRows] = /** @type {[any[], unknown]} */ (
      await conn.query(
        `SELECT virtuemart_product_id AS id, MIN(product_price) AS price
         FROM ${t("virtuemart_product_prices")} GROUP BY virtuemart_product_id`,
      )
    );
    const priceById = new Map(
      priceRows.map((r) => [Number(r.id), toNumber(r.price, 0)]),
    );

    const [productCategoryRows] = /** @type {[any[], unknown]} */ (
      await conn.query(
        `SELECT virtuemart_product_id AS productId, virtuemart_category_id AS categoryId
         FROM ${t("virtuemart_product_categories")}
         ORDER BY virtuemart_product_id, ordering, virtuemart_category_id`,
      )
    );
    /** @type {Map<number, number[]>} */
    const categoryIdsByProduct = new Map();
    for (const row of productCategoryRows) {
      const list = categoryIdsByProduct.get(Number(row.productId)) ?? [];
      list.push(Number(row.categoryId));
      categoryIdsByProduct.set(Number(row.productId), list);
    }

    const [manufacturerRows] = /** @type {[any[], unknown]} */ (
      await conn.query(
        `SELECT pm.virtuemart_product_id AS productId, md.mf_name AS name
         FROM ${t("virtuemart_product_manufacturers")} pm
         JOIN ${t("virtuemart_manufacturers_de_de")} md USING (virtuemart_manufacturer_id)
         ORDER BY pm.virtuemart_product_id, pm.virtuemart_manufacturer_id`,
      )
    );
    /** @type {Map<number, string[]>} */
    const manufacturersByProduct = new Map();
    for (const row of manufacturerRows) {
      const name = normalizeText(row.name);
      if (!name) continue;
      const list = manufacturersByProduct.get(Number(row.productId)) ?? [];
      if (!list.includes(name)) list.push(name);
      manufacturersByProduct.set(Number(row.productId), list);
    }

    const [mediaRows] = /** @type {[any[], unknown]} */ (
      await conn.query(
        `SELECT pm.virtuemart_product_id AS productId, pm.ordering, m.file_title AS title,
                m.file_url AS url, m.file_url_thumb AS thumb, m.file_mimetype AS mime
         FROM ${t("virtuemart_product_medias")} pm
         JOIN ${t("virtuemart_medias")} m USING (virtuemart_media_id)
         WHERE m.published = 1
         ORDER BY pm.virtuemart_product_id, pm.ordering, pm.id`,
      )
    );
    /** @type {Map<number, any[]>} */
    const mediaByProduct = new Map();
    for (const row of mediaRows) {
      const list = mediaByProduct.get(Number(row.productId)) ?? [];
      list.push(row);
      mediaByProduct.set(Number(row.productId), list);
    }

    await rm(outDir, { recursive: true, force: true });
    await mkdir(path.join(outDir, "files"), { recursive: true });

    /** @type {import("./lib/catalog-bundle.mjs").BundleProduct[]} */
    const products = [];
    /** @type {Map<string, number>} */
    const skuCounts = new Map();
    /** @type {Array<{ product: import("./lib/catalog-bundle.mjs").BundleProduct, url: string, dir: string }>} */
    const pendingDownloads = [];

    for (const row of productRows) {
      report.productsTotal += 1;
      const legacyId = Number(row.id);
      if (Number(row.published) !== 1) {
        report.productsUnpublished += 1;
        continue;
      }

      let baseSku = normalizeText(row.sku);
      if (!baseSku) {
        baseSku = `VM-${legacyId}`;
        report.skuEmpty.push({ legacyId, sku: baseSku });
      }
      let sku = `${skuPrefix}${baseSku}`;
      const seen = skuCounts.get(sku) ?? 0;
      skuCounts.set(sku, seen + 1);
      if (seen > 0) {
        const deduped = `${sku}-${legacyId}`;
        report.skuDuplicates.push({ legacyId, sku, assigned: deduped });
        sku = deduped;
      }

      const name =
        normalizeText(row.name).replace(/\s+/g, " ") || `Produkt ${legacyId}`;

      // Units: --force-unit wins; otherwise map the legacy unit, falling back to pieces.
      const legacyUnit = normalizeText(row.unit)
        .toLowerCase()
        .replace(/[\s.]/g, "");
      const mapped = forceUnit
        ? {
            unitKind: UNIT_KIND_BY_BASE[forceUnit] ?? "PIECE",
            baseUnit: forceUnit,
            baseStep: 1,
          }
        : (UNIT_MAP[legacyUnit] ?? null);
      if (!mapped) {
        report.unitFallbacks[legacyUnit || "(leer)"] =
          (report.unitFallbacks[legacyUnit || "(leer)"] ?? 0) + 1;
      }
      const unit = mapped ?? {
        unitKind: "PIECE",
        baseUnit: "PCS",
        baseStep: 1,
      };
      const unitStep = normalizeStep(
        unit.baseUnit,
        toNumber(row.packaging, 1) * (unit.baseStep ?? 1),
      );

      const categoryNames = (categoryIdsByProduct.get(legacyId) ?? [])
        .map((id) => categories.get(id))
        .filter((c) => c !== undefined)
        .sort((a, b) => Number(b.published) - Number(a.published))
        .map((c) => c.name)
        .filter((n, i, all) => all.indexOf(n) === i);
      if (categoryNames.length === 0) {
        report.productsWithoutCategory.push({ legacyId, sku });
        categoryNames.push(fallbackCategory);
      }

      const descriptionParts = [
        htmlToText(row.descr) || htmlToText(row.shortDescr),
      ];
      const manufacturers = manufacturersByProduct.get(legacyId) ?? [];
      if (manufacturers.length > 0)
        descriptionParts.push(`Hersteller: ${manufacturers.join(", ")}`);
      const description = descriptionParts.filter(Boolean).join("\n") || null;

      const quantityOnHand = Math.max(0, toNumber(row.inStock, 0));
      const product = {
        legacyId,
        sku,
        name,
        description,
        price: Math.max(0, toNumber(priceById.get(legacyId), 0)).toFixed(2),
        quantityOnHand: quantityOnHand.toFixed(3),
        minimumQuantity: Math.max(0, toNumber(row.lowStock, 0)).toFixed(3),
        unitKind: unit.unitKind,
        baseUnit: unit.baseUnit,
        unitStep,
        categories: categoryNames,
        images:
          /** @type {import("./lib/catalog-bundle.mjs").BundleImage[]} */ ([]),
        documents:
          /** @type {import("./lib/catalog-bundle.mjs").BundleDocument[]} */ ([]),
      };

      const productDir = path.join("files", safeSegment(sku));
      await mkdir(path.join(outDir, productDir), { recursive: true });

      const usedDocumentNames = new Set();
      let imageIndex = 0;
      for (const media of mediaByProduct.get(legacyId) ?? []) {
        const mime = normalizeText(media.mime).toLowerCase();
        const source =
          resolveMediaFile(media.url) ?? resolveMediaFile(media.thumb);
        if (!source) {
          (mime.startsWith("image/")
            ? report.imagesMissing
            : report.documentsMissing
          ).push({
            legacyId,
            sku,
            url: normalizeText(media.url),
          });
          continue;
        }

        if (mime.startsWith("image/")) {
          imageIndex += 1;
          const ext = (path.extname(source) || ".jpg").toLowerCase();
          const file = path.join(
            productDir,
            imageIndex === 1
              ? `pic${ext}`
              : `pic-${String(imageIndex).padStart(3, "0")}${ext}`,
          );
          await copyFile(source, path.join(outDir, file));
          product.images.push({
            file: file.split(path.sep).join("/"),
            altText: normalizeText(media.title) || name,
            sortOrder: imageIndex - 1,
          });
          report.imagesCopied += 1;
        } else {
          const original = path.basename(source);
          const ext = path.extname(original).toLowerCase();
          const base =
            sanitizeFileBase(path.basename(original, path.extname(original))) ||
            "dokument";
          let fileName = `${base}${ext}`;
          for (let n = 2; usedDocumentNames.has(fileName); n += 1)
            fileName = `${base}-${n}${ext}`;
          usedDocumentNames.add(fileName);
          const file = path.join(productDir, fileName);
          await copyFile(source, path.join(outDir, file));
          product.documents.push({
            file: file.split(path.sep).join("/"),
            originalName: original,
            mimeType: mime || "application/octet-stream",
          });
          report.documentsCopied += 1;
        }
      }

      if (downloadLinks) {
        for (const url of extractLinks(row.descr)) {
          report.linksFound += 1;
          pendingDownloads.push({ product, url, dir: productDir });
        }
      }

      products.push(product);
      report.productsExtracted += 1;
    }

    if (pendingDownloads.length > 0) {
      logStep(
        `Downloading ${pendingDownloads.length} linked data sheets (concurrency ${DOWNLOAD_CONCURRENCY})`,
      );
      /** @type {Map<string, Promise<Awaited<ReturnType<typeof downloadPdf>>>>} */
      const cache = new Map();
      /** @type {Map<string, Promise<void>>} */
      const hostQueues = new Map();
      let done = 0;
      await runPool(
        pendingDownloads,
        DOWNLOAD_CONCURRENCY,
        async ({ product, url, dir }) => {
          let pending = cache.get(url);
          if (!pending) {
            // One request at a time per host, so rate-limited vendors aren't hammered in parallel.
            const host = new URL(url).host;
            const previous = hostQueues.get(host) ?? Promise.resolve();
            pending = previous.then(() => downloadPdf(url));
            hostQueues.set(
              host,
              pending.then(() => undefined),
            );
            cache.set(url, pending);
          }
          const result = await pending;
          done += 1;
          if (done % 25 === 0)
            logStep(`  ${done}/${pendingDownloads.length} links processed`);
          if (!result.ok) {
            const bucket = result.reason.startsWith("not a PDF")
              ? report.linkDownloadsNotPdf
              : report.linkDownloadsFailed;
            bucket.push({ sku: product.sku, url, reason: result.reason });
            return;
          }
          const existingNames = new Set(
            product.documents.map((d) => path.posix.basename(d.file)),
          );
          let fileName = "Sicherheitsdatenblatt.pdf";
          for (let n = 2; existingNames.has(fileName); n += 1)
            fileName = `Sicherheitsdatenblatt-${n}.pdf`;
          const file = path.join(dir, fileName);
          await writeFile(path.join(outDir, file), result.bytes);
          product.documents.push({
            file: file.split(path.sep).join("/"),
            originalName: fileName,
            mimeType: "application/pdf",
            sourceUrl: url,
          });
          report.linkDownloadsOk += 1;
        },
      );
    }

    /** @type {import("./lib/catalog-bundle.mjs").CatalogBundle} */
    const bundle = {
      version: BUNDLE_VERSION,
      extractedAt: new Date().toISOString(),
      source: { database: legacyDatabase, tablePrefix, skuPrefix },
      storageRoom,
      storageLocation: { code: locationCode, name: locationName },
      fallbackCategory,
      products,
    };
    await writeFile(
      path.join(outDir, "catalog.json"),
      JSON.stringify(bundle, null, 2),
      "utf8",
    );
    await writeFile(
      path.join(outDir, "extract-report.json"),
      JSON.stringify(report, null, 2),
      "utf8",
    );

    // Sanity check: every referenced file exists and is non-empty.
    for (const product of products) {
      for (const ref of [...product.images, ...product.documents]) {
        const info = await stat(path.join(outDir, ref.file));
        if (info.size === 0)
          throw new Error(`Empty file in bundle: ${ref.file}`);
      }
    }
    // Round-trip parse to catch serialisation problems early.
    JSON.parse(await readFile(path.join(outDir, "catalog.json"), "utf8"));

    logStep(`Bundle written to ${outDir}`);
    console.log({
      productsExtracted: report.productsExtracted,
      productsUnpublished: report.productsUnpublished,
      skuEmpty: report.skuEmpty.length,
      skuDuplicates: report.skuDuplicates.length,
      unitFallbacks: report.unitFallbacks,
      imagesCopied: report.imagesCopied,
      imagesMissing: report.imagesMissing.length,
      documentsCopied: report.documentsCopied,
      documentsMissing: report.documentsMissing.length,
      linksFound: report.linksFound,
      linkDownloadsOk: report.linkDownloadsOk,
      linkDownloadsNotPdf: report.linkDownloadsNotPdf.length,
      linkDownloadsFailed: report.linkDownloadsFailed.length,
      productsWithoutCategory: report.productsWithoutCategory.length,
    });
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
