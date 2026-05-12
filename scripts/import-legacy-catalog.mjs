import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import mysql from "mysql2/promise";
import { BaseUnit, PrismaClient, UnitKind } from "@prisma/client";

// Prefer runtime-injected env vars (Docker/CI/prod). For local CLI usage,
// fall back to loading .env automatically when Node supports it.
if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
  const envPath = path.resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

const connectionString = process.env.DATABASE_URL;
const legacyHost = process.env.LEGACY_DB_HOST;
const legacyPort = Number.parseInt(process.env.LEGACY_DB_PORT ?? "3306", 10);
const legacyUser = process.env.LEGACY_DB_USER;
const legacyPassword = process.env.LEGACY_DB_PASSWORD;
const legacyDatabase = process.env.LEGACY_DB_NAME;
const legacyMediaBaseUrl = process.env.LEGACY_MEDIA_BASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Provide it as an environment variable (recommended for Docker/prod) or create a local .env for manual runs.",
  );
}

if (!legacyHost || !legacyUser || !legacyDatabase) {
  throw new Error("Missing legacy DB env vars. Required: LEGACY_DB_HOST, LEGACY_DB_USER, LEGACY_DB_NAME");
}

if (!legacyMediaBaseUrl) {
  throw new Error("LEGACY_MEDIA_BASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const report = {
  categoriesCreated: 0,
  categoriesUpdated: 0,
  storageLocationsCreated: 0,
  storageLocationsUpdated: 0,
  productsCreated: 0,
  productsUpdated: 0,
  productsSkipped: 0,
  imagesDownloaded: 0,
  imagesFailed: 0,
  imagesUpserted: 0,
  unitFallbacks: 0,
  unknownProductUnits: {},
  skipped: [],
};

const PRODUCT_LOG_EVERY = 50;
const IMAGE_LOG_EVERY = 100;

/**
 * @param {string} message
 */
function logStep(message) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${message}`);
}

/**
 * @param {string | null | undefined} value
 */
function normalizeText(value) {
  return (value ?? "").trim();
}

/**
 * @param {string | null | undefined} value
 */
function stripHtml(value) {
  if (!value) return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string | null | undefined} value
 */
function normalizeProductName(value) {
  return normalizeText(value).replace(/\+\+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * @param {string} value
 */
function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * @param {string} value
 */
function safeSegment(value) {
  const normalized = value.replace(/[^a-zA-Z0-9._-]/g, "_");
  return normalized.length > 0 ? normalized : "unknown";
}

/**
 * @param {string} urlOrPath
 * @param {string} baseUrl
 */
function toAbsoluteMediaUrl(urlOrPath, baseUrl) {
  const trimmed = normalizeText(urlOrPath);
  if (!trimmed) return null;
  try {
    return new URL(trimmed).toString();
  } catch {
    return new URL(trimmed.replace(/^\/+/, ""), `${baseUrl.replace(/\/+$/, "")}/`).toString();
  }
}

/**
 * @param {string | null | undefined} raw
 * @param {number} fallback
 */
function toNumber(raw, fallback = 0) {
  const parsed = Number.parseFloat(String(raw ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * @param {string | null | undefined} rawUnit
 */
function normalizeLegacyUnit(rawUnit) {
  const trimmed = normalizeText(rawUnit).toLowerCase();
  if (!trimmed) return "";
  return trimmed
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(/²/g, "2")
    .replace("qm", "m2")
    .replace("qcm", "dm2")
    .replace("qdm", "dm2");
}

/**
 * @param {string | null | undefined} rawUnit
 */
function mapLegacyUnit(rawUnit) {
  const unit = normalizeLegacyUnit(rawUnit);
  if (!unit) {
    return { unitKind: UnitKind.PIECE, baseUnit: BaseUnit.PCS, baseStep: 1, matched: false, normalizedUnit: unit };
  }

  /** @type {Record<string, { unitKind: UnitKind, baseUnit: BaseUnit, baseStep?: number }>} */
  const mapping = {
    pcs: { unitKind: UnitKind.PIECE, baseUnit: BaseUnit.PCS },
    piece: { unitKind: UnitKind.PIECE, baseUnit: BaseUnit.PCS },
    st: { unitKind: UnitKind.PIECE, baseUnit: BaseUnit.PCS },
    stk: { unitKind: UnitKind.PIECE, baseUnit: BaseUnit.PCS },
    mm: { unitKind: UnitKind.LENGTH, baseUnit: BaseUnit.MM },
    cm: { unitKind: UnitKind.LENGTH, baseUnit: BaseUnit.CM },
    dm: { unitKind: UnitKind.LENGTH, baseUnit: BaseUnit.CM, baseStep: 10 },
    m: { unitKind: UnitKind.LENGTH, baseUnit: BaseUnit.M },
    cm2: { unitKind: UnitKind.AREA, baseUnit: BaseUnit.DM2 },
    dm2: { unitKind: UnitKind.AREA, baseUnit: BaseUnit.DM2 },
    m2: { unitKind: UnitKind.AREA, baseUnit: BaseUnit.M2 },
    g: { unitKind: UnitKind.WEIGHT, baseUnit: BaseUnit.G },
    dag: { unitKind: UnitKind.WEIGHT, baseUnit: BaseUnit.G, baseStep: 10 },
    kg: { unitKind: UnitKind.WEIGHT, baseUnit: BaseUnit.KG },
    ml: { unitKind: UnitKind.VOLUME, baseUnit: BaseUnit.ML },
    cl: { unitKind: UnitKind.VOLUME, baseUnit: BaseUnit.L, baseStep: 0.01 },
    l: { unitKind: UnitKind.VOLUME, baseUnit: BaseUnit.L },
    bund: { unitKind: UnitKind.PIECE, baseUnit: BaseUnit.PCS },
    pkg: { unitKind: UnitKind.PIECE, baseUnit: BaseUnit.PCS },
    spule: { unitKind: UnitKind.PIECE, baseUnit: BaseUnit.PCS },
    rolle: { unitKind: UnitKind.PIECE, baseUnit: BaseUnit.PCS },
  };

  const mapped = mapping[unit];
  if (mapped) {
    return {
      unitKind: mapped.unitKind,
      baseUnit: mapped.baseUnit,
      baseStep: mapped.baseStep ?? 1,
      matched: true,
      normalizedUnit: unit,
    };
  }

  return { unitKind: UnitKind.PIECE, baseUnit: BaseUnit.PCS, baseStep: 1, matched: false, normalizedUnit: unit };
}

/**
 * @param {number} value
 */
function toPrismaDecimalStep(value) {
  const safe = Number.isFinite(value) && value > 0 ? value : 1;
  return safe.toFixed(3);
}

/**
 * @param {string | null | undefined} maybeSku
 * @param {number} vmProductId
 */
function resolveSku(maybeSku, vmProductId) {
  const cleaned = normalizeText(maybeSku);
  return cleaned.length > 0 ? cleaned : `VM-${vmProductId}`;
}

async function main() {
  logStep("Starting legacy catalog import");
  logStep(`Connecting to legacy DB ${legacyHost}:${legacyPort}/${legacyDatabase}`);
  const mysqlConnection = await mysql.createConnection({
    host: legacyHost,
    port: legacyPort,
    user: legacyUser,
    password: legacyPassword,
    database: legacyDatabase,
    charset: "utf8mb4",
  });

  try {
    logStep("Ensuring storage room and fallback storage location");
    const storageRoom = await prisma.storageRoom.upsert({
      where: { name: "Lager" },
      update: {},
      create: { name: "Lager" },
    });

    const [categoryRows] = await mysqlConnection.execute(
      `
      SELECT
        c.virtuemart_category_id AS categoryId,
        c.published AS published,
        cd.category_name AS categoryName,
        cd.slug AS slug
      FROM fs2xc_virtuemart_categories c
      LEFT JOIN fs2xc_virtuemart_categories_de_de cd
        ON cd.virtuemart_category_id = c.virtuemart_category_id
      `,
    );
    logStep(`Fetched ${/** @type {Array<any>} */ (categoryRows).length} legacy categories`);

    /** @type {Map<number, string>} */
    const categoryIdToNewId = new Map();
    const usedCategorySlugs = new Set();
    const publishedLegacyCategoryIds = new Set();

    for (const row of /** @type {Array<any>} */ (categoryRows)) {
      const categoryId = Number(row.categoryId);
      if (Number(row.published) === 1) {
        publishedLegacyCategoryIds.add(categoryId);
      }
      const name = normalizeText(row.categoryName);
      if (!name) {
        report.skipped.push({ type: "category", categoryId, reason: "missing category_name" });
        continue;
      }

      let baseSlug = normalizeText(row.slug) || slugify(name);
      if (!baseSlug) baseSlug = `category-${categoryId}`;
      let finalSlug = baseSlug;
      let suffix = 1;
      while (usedCategorySlugs.has(finalSlug)) {
        finalSlug = `${baseSlug}-${suffix}`;
        suffix += 1;
      }
      usedCategorySlugs.add(finalSlug);

      const existing = await prisma.category.findUnique({
        where: { name },
        select: { id: true, slug: true },
      });

      if (existing) {
        const updated = await prisma.category.update({
          where: { id: existing.id },
          data: {
            slug: existing.slug ?? finalSlug,
          },
          select: { id: true },
        });
        categoryIdToNewId.set(categoryId, updated.id);
        report.categoriesUpdated += 1;
      } else {
        const created = await prisma.category.create({
          data: { name, slug: finalSlug },
          select: { id: true },
        });
        categoryIdToNewId.set(categoryId, created.id);
        report.categoriesCreated += 1;
      }
    }
    logStep(
      `Categories done (created=${report.categoriesCreated}, updated=${report.categoriesUpdated}, skipped=${report.skipped.filter((s) => s.type === "category").length})`,
    );

    const [manufacturerRows] = await mysqlConnection.execute(
      `
      SELECT
        m.virtuemart_manufacturer_id AS manufacturerId,
        md.mf_name AS manufacturerName,
        md.slug AS manufacturerSlug
      FROM fs2xc_virtuemart_manufacturers m
      LEFT JOIN fs2xc_virtuemart_manufacturers_de_de md
        ON md.virtuemart_manufacturer_id = m.virtuemart_manufacturer_id
      `,
    );
    logStep(`Fetched ${/** @type {Array<any>} */ (manufacturerRows).length} legacy manufacturers`);

    /** @type {Map<number, string>} */
    const manufacturerIdToStorageLocationId = new Map();
    const usedLocationCodes = new Set(["unknown-manufacturer"]);

    for (const row of /** @type {Array<any>} */ (manufacturerRows)) {
      const manufacturerId = Number(row.manufacturerId);
      const manufacturerName = normalizeText(row.manufacturerName) || `Hersteller-${manufacturerId}`;
      const slugBase = normalizeText(row.manufacturerSlug) || slugify(manufacturerName) || `manufacturer-${manufacturerId}`;

      let code = safeSegment(slugBase).slice(0, 64);
      if (!code) code = `manufacturer-${manufacturerId}`;
      if (usedLocationCodes.has(code)) {
        code = `${code}-${manufacturerId}`;
      }
      usedLocationCodes.add(code);

      const existing = await prisma.storageLocation.findUnique({
        where: { code },
        select: { id: true },
      });

      if (existing) {
        await prisma.storageLocation.update({
          where: { id: existing.id },
          data: {
            name: manufacturerName,
            storageRoomId: storageRoom.id,
          },
        });
        manufacturerIdToStorageLocationId.set(manufacturerId, existing.id);
        report.storageLocationsUpdated += 1;
      } else {
        const created = await prisma.storageLocation.create({
          data: {
            code,
            name: manufacturerName,
            storageRoomId: storageRoom.id,
          },
          select: { id: true },
        });
        manufacturerIdToStorageLocationId.set(manufacturerId, created.id);
        report.storageLocationsCreated += 1;
      }
    }
    logStep(
      `Storage locations done (created=${report.storageLocationsCreated}, updated=${report.storageLocationsUpdated})`,
    );

    const [productRows] = await mysqlConnection.execute(
      `
      SELECT
        p.virtuemart_product_id AS productId,
        p.product_sku AS sku,
        p.product_in_stock AS inStock,
        p.low_stock_notification AS lowStockNotification,
        p.product_unit AS productUnit,
        p.product_packaging AS productPackaging,
        p.published AS published,
        pd.product_name AS productName,
        pd.product_desc AS productDesc,
        pd.product_s_desc AS productShortDesc
      FROM fs2xc_virtuemart_products p
      LEFT JOIN fs2xc_virtuemart_products_de_de pd
        ON pd.virtuemart_product_id = p.virtuemart_product_id
      `,
    );
    logStep(`Fetched ${/** @type {Array<any>} */ (productRows).length} legacy products`);

    const [priceRows] = await mysqlConnection.execute(
      `
      SELECT
        virtuemart_product_id AS productId,
        MIN(product_price) AS productPrice
      FROM fs2xc_virtuemart_product_prices
      GROUP BY virtuemart_product_id
      `,
    );
    logStep(`Fetched ${/** @type {Array<any>} */ (priceRows).length} legacy product price rows`);

    /** @type {Map<number, number>} */
    const productIdToPrice = new Map();
    for (const row of /** @type {Array<any>} */ (priceRows)) {
      productIdToPrice.set(Number(row.productId), toNumber(row.productPrice, 0));
    }

    const [productCategoryRows] = await mysqlConnection.execute(
      `
      SELECT
        virtuemart_product_id AS productId,
        virtuemart_category_id AS categoryId,
        ordering AS ordering
      FROM fs2xc_virtuemart_product_categories
      ORDER BY virtuemart_product_id ASC, ordering ASC, virtuemart_category_id ASC
      `,
    );
    logStep(`Fetched ${/** @type {Array<any>} */ (productCategoryRows).length} product-category rows`);

    /** @type {Map<number, number[]>} */
    const productIdToCategoryIds = new Map();
    for (const row of /** @type {Array<any>} */ (productCategoryRows)) {
      const productId = Number(row.productId);
      const categoryId = Number(row.categoryId);
      if (!Number.isFinite(categoryId) || categoryId <= 0) continue;
      const list = productIdToCategoryIds.get(productId) ?? [];
      list.push(categoryId);
      productIdToCategoryIds.set(productId, list);
    }

    const [productManufacturerRows] = await mysqlConnection.execute(
      `
      SELECT
        virtuemart_product_id AS productId,
        MIN(virtuemart_manufacturer_id) AS manufacturerId
      FROM fs2xc_virtuemart_product_manufacturers
      GROUP BY virtuemart_product_id
      `,
    );
    logStep(`Fetched ${/** @type {Array<any>} */ (productManufacturerRows).length} product-manufacturer rows`);

    /** @type {Map<number, number>} */
    const productIdToManufacturerId = new Map();
    for (const row of /** @type {Array<any>} */ (productManufacturerRows)) {
      productIdToManufacturerId.set(Number(row.productId), Number(row.manufacturerId));
    }

    const [productMediaRows] = await mysqlConnection.execute(
      `
      SELECT
        pm.virtuemart_product_id AS productId,
        pm.ordering AS ordering,
        m.file_title AS fileTitle,
        m.file_url AS fileUrl,
        m.file_url_thumb AS fileUrlThumb,
        m.file_mimetype AS fileMimeType
      FROM fs2xc_virtuemart_product_medias pm
      INNER JOIN fs2xc_virtuemart_medias m
        ON m.virtuemart_media_id = pm.virtuemart_media_id
      ORDER BY pm.virtuemart_product_id ASC, pm.ordering ASC, pm.id ASC
      `,
    );
    logStep(`Fetched ${/** @type {Array<any>} */ (productMediaRows).length} product-media rows`);

    /** @type {Map<number, Array<any>>} */
    const productIdToMedia = new Map();
    for (const row of /** @type {Array<any>} */ (productMediaRows)) {
      const productId = Number(row.productId);
      const list = productIdToMedia.get(productId) ?? [];
      list.push(row);
      productIdToMedia.set(productId, list);
    }

    const picturesRoot = path.resolve(process.cwd(), "public", "data", "uploads", "pictures");
    await mkdir(picturesRoot, { recursive: true });
    logStep(`Pictures output directory ready: ${picturesRoot}`);

    let publishedProductsProcessed = 0;
    let totalImagesAttempted = 0;
    for (const row of /** @type {Array<any>} */ (productRows)) {
      const productId = Number(row.productId);
      if (Number(row.published) !== 1) {
        continue;
      }
      publishedProductsProcessed += 1;

      const sku = resolveSku(row.sku, productId);
      const productName = normalizeProductName(row.productName) || `Legacy Product ${productId}`;
      const description = stripHtml(row.productDesc) || stripHtml(row.productShortDesc) || null;
      const quantityOnHand = toNumber(row.inStock, 0);
      const minimumQuantity = toNumber(row.lowStockNotification, 0);
      const price = toNumber(productIdToPrice.get(productId), 0).toFixed(2);
      const mappedUnit = mapLegacyUnit(row.productUnit);
      const packagingStep = toNumber(row.productPackaging, 1);
      const unitStep = toPrismaDecimalStep(packagingStep * mappedUnit.baseStep);
      if (!mappedUnit.matched) {
        report.unitFallbacks += 1;
        if (mappedUnit.normalizedUnit) {
          const current = Number(report.unknownProductUnits[mappedUnit.normalizedUnit] ?? 0);
          report.unknownProductUnits[mappedUnit.normalizedUnit] = current + 1;
        }
      }

      const legacyCategoryCandidates = productIdToCategoryIds.get(productId) ?? [];
      const preferredLegacyCategoryId =
        legacyCategoryCandidates.find(
          (candidateId) =>
            publishedLegacyCategoryIds.has(candidateId) && categoryIdToNewId.has(candidateId),
        ) ??
        legacyCategoryCandidates.find((candidateId) => categoryIdToNewId.has(candidateId));
      const mappedCategoryId =
        typeof preferredLegacyCategoryId === "number"
          ? (categoryIdToNewId.get(preferredLegacyCategoryId) ?? null)
          : null;
      const manufacturerId = productIdToManufacturerId.get(productId);
      const mappedStorageLocationId =
        typeof manufacturerId === "number"
          ? (manufacturerIdToStorageLocationId.get(manufacturerId) ?? null)
          : null;

      const existing = await prisma.product.findUnique({
        where: { sku },
        select: { id: true },
      });

      let savedProductId;
      if (existing) {
        const updated = await prisma.product.update({
          where: { id: existing.id },
          data: {
            name: productName,
            description,
            price,
            quantityOnHand,
            minimumQuantity,
            unitKind: mappedUnit.unitKind,
            baseUnit: mappedUnit.baseUnit,
            unitStep,
            categoryId: mappedCategoryId,
            storageLocationId: mappedStorageLocationId,
          },
          select: { id: true },
        });
        savedProductId = updated.id;
        report.productsUpdated += 1;
      } else {
        const created = await prisma.product.create({
          data: {
            sku,
            name: productName,
            description,
            price,
            quantityOnHand,
            minimumQuantity,
            unitKind: mappedUnit.unitKind,
            baseUnit: mappedUnit.baseUnit,
            unitStep,
            categoryId: mappedCategoryId,
            storageLocationId: mappedStorageLocationId,
          },
          select: { id: true },
        });
        savedProductId = created.id;
        report.productsCreated += 1;
      }

      if (legacyCategoryCandidates.length > 0) {
        const allMappedCategoryIds = legacyCategoryCandidates
          .map((legacyCategoryId) => categoryIdToNewId.get(legacyCategoryId))
          .filter((value, index, array) => typeof value === "string" && array.indexOf(value) === index);
        for (const categoryId of allMappedCategoryIds) {
          await prisma.productCategory.upsert({
            where: {
              productId_categoryId: {
                productId: savedProductId,
                categoryId,
              },
            },
            update: {},
            create: {
              productId: savedProductId,
              categoryId,
            },
          });
        }
      }

      const mediaRows = productIdToMedia.get(productId) ?? [];
      totalImagesAttempted += mediaRows.length;
      let imageIndex = 0;
      for (const media of mediaRows) {
        const sourceCandidates = [
          toAbsoluteMediaUrl(media.fileUrl, legacyMediaBaseUrl),
          toAbsoluteMediaUrl(media.fileUrlThumb, legacyMediaBaseUrl),
        ].filter(Boolean);
        if (sourceCandidates.length === 0) {
          report.imagesFailed += 1;
          report.skipped.push({
            type: "image",
            productId,
            sku,
            reason: "missing file_url/file_url_thumb",
          });
          continue;
        }

        const sourcePathname = new URL(sourceCandidates[0]).pathname;
        const ext = path.extname(sourcePathname) || ".jpg";
        const folderName = safeSegment(sku);
        const fileName = imageIndex === 0 ? "pic.jpg" : `pic-${String(imageIndex + 1).padStart(3, "0")}${ext.toLowerCase()}`;
        const targetDir = path.join(picturesRoot, folderName);
        const targetPath = path.join(targetDir, fileName);
        const publicUrl = `/data/uploads/pictures/${folderName}/${fileName}`;

        await mkdir(targetDir, { recursive: true });

        try {
          let downloaded = false;
          for (const candidateUrl of sourceCandidates) {
            const response = await fetch(candidateUrl);
            if (!response.ok) {
              continue;
            }

            const arrayBuffer = await response.arrayBuffer();
            await writeFile(targetPath, Buffer.from(arrayBuffer));
            report.imagesDownloaded += 1;
            downloaded = true;
            break;
          }

          if (!downloaded) {
            throw new Error("HTTP fetch failed for all source candidates");
          }
        } catch (error) {
          report.imagesFailed += 1;
          report.skipped.push({
            type: "image",
            productId,
            sku,
            sourceUrl: sourceCandidates.join(" | "),
            reason: String(error),
          });
          imageIndex += 1;
          continue;
        }

        const sortOrder = Number.isFinite(Number(media.ordering)) ? Number(media.ordering) : imageIndex;
        const existingImage = await prisma.productImage.findFirst({
          where: { productId: savedProductId, sortOrder },
          select: { id: true },
        });

        if (existingImage) {
          await prisma.productImage.update({
            where: { id: existingImage.id },
            data: {
              url: publicUrl,
              altText: normalizeText(media.fileTitle) || productName,
              sortOrder,
            },
          });
        } else {
          await prisma.productImage.create({
            data: {
              productId: savedProductId,
              url: publicUrl,
              altText: normalizeText(media.fileTitle) || productName,
              sortOrder,
            },
          });
        }
        report.imagesUpserted += 1;
        imageIndex += 1;

        if (report.imagesUpserted % IMAGE_LOG_EVERY === 0) {
          logStep(
            `Image progress: upserted=${report.imagesUpserted}, downloaded=${report.imagesDownloaded}, failed=${report.imagesFailed}`,
          );
        }
      }

      if (publishedProductsProcessed % PRODUCT_LOG_EVERY === 0) {
        logStep(
          `Product progress: processed=${publishedProductsProcessed}, created=${report.productsCreated}, updated=${report.productsUpdated}, imagesAttempted=${totalImagesAttempted}`,
        );
      }
    }

    const reportPath = path.resolve(process.cwd(), "scripts", "import-legacy-catalog.report.json");
    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
    logStep("Import complete");
    console.log(report);
    logStep(`Report written to ${reportPath}`);
  } finally {
    logStep("Closing DB connections");
    await mysqlConnection.end();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
