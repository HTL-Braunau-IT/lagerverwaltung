// Step 2 of the legacy import: load a bundle written by extract-virtuemart-bundle.mjs into the
// app database and the uploads folder. Safe to re-run: products that already exist in the target
// storage room are left alone (unless --update-existing), and SKUs that belong to another room are
// never touched — they are reported as conflicts instead.
//
// Usage (locally or inside the app container, where DATABASE_URL is set):
//   node scripts/import-catalog-bundle.mjs --bundle <dir> --dry-run
//   node scripts/import-catalog-bundle.mjs --bundle <dir>
// Options:
//   --uploads-root <dir>   default: <cwd>/public/data/uploads
//   --update-existing      also update name/description/unit/categories of products already in the room
//                          (stock and price are never overwritten on existing products)

import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import {
  BUNDLE_VERSION,
  logStep,
  parseArgs,
  safeSegment,
  slugify,
} from "./lib/catalog-bundle.mjs";

if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
  const envPath = path.resolve(process.cwd(), ".env");
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

const args = parseArgs(process.argv.slice(2));
const bundleArg = args.get("bundle");
if (!bundleArg || bundleArg === "true")
  throw new Error("Missing required argument --bundle <dir>");
const bundleDir = path.resolve(bundleArg);
const dryRun = args.has("dry-run");
const updateExisting = args.has("update-existing");
const uploadsRoot = path.resolve(
  args.get("uploads-root") ??
    path.join(process.cwd(), "public", "data", "uploads"),
);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const UNIT_KINDS = new Set(["PIECE", "LENGTH", "AREA", "WEIGHT", "VOLUME"]);
const BASE_UNITS = new Set([
  "PCS",
  "MM",
  "CM",
  "M",
  "CM2",
  "DM2",
  "MM2",
  "M2",
  "G",
  "KG",
  "ML",
  "L",
]);

const report = {
  dryRun,
  storageRoom: /** @type {"existing" | "created" | "would-create"} */ (
    "existing"
  ),
  storageLocation: /** @type {"existing" | "created" | "would-create"} */ (
    "existing"
  ),
  categoriesCreated: /** @type {string[]} */ ([]),
  categoriesReused: /** @type {string[]} */ ([]),
  productsCreated: 0,
  productsUpdated: 0,
  productsUnchanged: 0,
  productsFailed: /** @type {Array<{ sku: string, error: string }>} */ ([]),
  skuConflicts:
    /** @type {Array<{ sku: string, existingProductId: string, existingRoom: string | null }>} */ ([]),
  imagesWritten: 0,
  documentsWritten: 0,
};

/**
 * Resolves a bundle-relative file path, refusing anything outside the bundle.
 * @param {string} relative
 */
function bundleFile(relative) {
  const resolved = path.resolve(bundleDir, relative);
  if (!resolved.startsWith(bundleDir + path.sep))
    throw new Error(`Bundle path escapes bundle dir: ${relative}`);
  if (!existsSync(resolved))
    throw new Error(`Bundle file missing: ${relative}`);
  return resolved;
}

/**
 * @param {import("./lib/catalog-bundle.mjs").CatalogBundle} bundle
 */
function validateBundle(bundle) {
  if (bundle.version !== BUNDLE_VERSION) {
    throw new Error(
      `Unsupported bundle version ${bundle.version} (expected ${BUNDLE_VERSION})`,
    );
  }
  if (!bundle.storageRoom || !bundle.storageLocation?.code)
    throw new Error("Bundle lacks storage room/location");
  const skus = new Set();
  for (const p of bundle.products) {
    if (!p.sku || skus.has(p.sku))
      throw new Error(`Empty or duplicate SKU in bundle: "${p.sku}"`);
    skus.add(p.sku);
    if (!UNIT_KINDS.has(p.unitKind) || !BASE_UNITS.has(p.baseUnit)) {
      throw new Error(`Invalid unit for ${p.sku}: ${p.unitKind}/${p.baseUnit}`);
    }
    if (!/^\d+(\.\d{1,2})?$/.test(p.price))
      throw new Error(`Invalid price for ${p.sku}: ${p.price}`);
    if (p.categories.length === 0) throw new Error(`No category for ${p.sku}`);
    for (const ref of [...p.images, ...p.documents]) bundleFile(ref.file);
  }
}

/**
 * Returns category ids by name, creating missing ones (shared across rooms, matched by name).
 * @param {string[]} names
 */
async function resolveCategories(names) {
  /** @type {Map<string, string>} */
  const idsByName = new Map();
  for (const name of names) {
    const existing = await prisma.category.findUnique({
      where: { name },
      select: { id: true },
    });
    if (existing) {
      idsByName.set(name, existing.id);
      report.categoriesReused.push(name);
      continue;
    }
    report.categoriesCreated.push(name);
    if (dryRun) {
      idsByName.set(name, `dry-run:${name}`);
      continue;
    }
    const baseSlug = slugify(name) || "kategorie";
    let slug = baseSlug;
    for (
      let n = 2;
      await prisma.category.findUnique({
        where: { slug },
        select: { id: true },
      });
      n += 1
    ) {
      slug = `${baseSlug}-${n}`;
    }
    const created = await prisma.category.create({
      data: { name, slug },
      select: { id: true },
    });
    idsByName.set(name, created.id);
  }
  return idsByName;
}

async function main() {
  const bundle =
    /** @type {import("./lib/catalog-bundle.mjs").CatalogBundle} */ (
      JSON.parse(await readFile(path.join(bundleDir, "catalog.json"), "utf8"))
    );
  validateBundle(bundle);
  logStep(
    `${dryRun ? "[DRY RUN] " : ""}Importing ${bundle.products.length} products into "${bundle.storageRoom}" (uploads: ${uploadsRoot})`,
  );

  // Storage room + location.
  let room = await prisma.storageRoom.findUnique({
    where: { name: bundle.storageRoom },
    select: { id: true },
  });
  if (!room) {
    report.storageRoom = dryRun ? "would-create" : "created";
    if (!dryRun) {
      room = await prisma.storageRoom.create({
        data: { name: bundle.storageRoom },
        select: { id: true },
      });
    }
  }

  let location = await prisma.storageLocation.findUnique({
    where: { code: bundle.storageLocation.code },
    select: { id: true, storageRoomId: true },
  });
  if (location && location.storageRoomId !== room?.id) {
    throw new Error(
      `Storage location code "${bundle.storageLocation.code}" already exists in another storage room — choose a different --location-code`,
    );
  }
  if (!location) {
    report.storageLocation = dryRun ? "would-create" : "created";
    if (!dryRun && room) {
      location = await prisma.storageLocation.create({
        data: {
          code: bundle.storageLocation.code,
          name: bundle.storageLocation.name,
          storageRoomId: room.id,
        },
        select: { id: true, storageRoomId: true },
      });
    }
  }

  const allCategoryNames = [
    ...new Set(bundle.products.flatMap((p) => p.categories)),
  ];
  const categoryIds = await resolveCategories(allCategoryNames);

  let processed = 0;
  for (const product of bundle.products) {
    processed += 1;
    if (processed % 50 === 0)
      logStep(`  ${processed}/${bundle.products.length} products processed`);

    const existing = await prisma.product.findUnique({
      where: { sku: product.sku },
      select: {
        id: true,
        storageLocation: {
          select: {
            storageRoomId: true,
            storageRoom: { select: { name: true } },
          },
        },
      },
    });

    if (
      existing &&
      (!room || existing.storageLocation?.storageRoomId !== room.id)
    ) {
      report.skuConflicts.push({
        sku: product.sku,
        existingProductId: existing.id,
        existingRoom: existing.storageLocation?.storageRoom.name ?? null,
      });
      continue;
    }
    if (existing && !updateExisting) {
      report.productsUnchanged += 1;
      continue;
    }

    const productCategoryIds = product.categories.map((name) => {
      const id = categoryIds.get(name);
      if (!id) throw new Error(`Unresolved category "${name}"`);
      return id;
    });
    const primaryCategoryId = /** @type {string} */ (productCategoryIds[0]);

    if (dryRun) {
      if (existing) report.productsUpdated += 1;
      else {
        report.productsCreated += 1;
        report.imagesWritten += product.images.length;
        report.documentsWritten += product.documents.length;
      }
      continue;
    }
    if (!location) throw new Error("Storage location missing");
    const locationId = location.id;

    try {
      if (existing) {
        await prisma.$transaction(async (tx) => {
          await tx.product.update({
            where: { id: existing.id },
            data: {
              name: product.name,
              description: product.description,
              unitKind: /** @type {any} */ (product.unitKind),
              baseUnit: /** @type {any} */ (product.baseUnit),
              unitStep: product.unitStep,
              categoryId: primaryCategoryId,
            },
          });
          await tx.productCategory.createMany({
            data: productCategoryIds.map((categoryId) => ({
              productId: existing.id,
              categoryId,
            })),
            skipDuplicates: true,
          });
        });
        report.productsUpdated += 1;
        continue;
      }

      // New product: DB rows and files in one transaction; a failed file copy rolls the rows back.
      await prisma.$transaction(
        async (tx) => {
          const created = await tx.product.create({
            data: {
              sku: product.sku,
              name: product.name,
              description: product.description,
              price: product.price,
              quantityOnHand: product.quantityOnHand,
              minimumQuantity: product.minimumQuantity,
              unitKind: /** @type {any} */ (product.unitKind),
              baseUnit: /** @type {any} */ (product.baseUnit),
              unitStep: product.unitStep,
              categoryId: primaryCategoryId,
              storageLocationId: locationId,
              categories: {
                create: productCategoryIds.map((categoryId) => ({
                  categoryId,
                })),
              },
            },
            select: { id: true },
          });

          const pictureFolder = safeSegment(product.sku);
          for (const image of product.images) {
            const fileName = path.posix.basename(image.file);
            const targetDir = path.join(uploadsRoot, "pictures", pictureFolder);
            await mkdir(targetDir, { recursive: true });
            await copyFile(
              bundleFile(image.file),
              path.join(targetDir, fileName),
            );
            await tx.productImage.create({
              data: {
                productId: created.id,
                url: `/data/uploads/pictures/${pictureFolder}/${fileName}`,
                altText: image.altText,
                sortOrder: image.sortOrder,
              },
            });
          }

          for (const document of product.documents) {
            const fileName = path.posix.basename(document.file);
            const source = bundleFile(document.file);
            const targetDir = path.join(
              uploadsRoot,
              "documents",
              "products",
              created.id,
            );
            await mkdir(targetDir, { recursive: true });
            await copyFile(source, path.join(targetDir, fileName));
            const bytes = (await readFile(source)).length;
            const row = await tx.productDocument.create({
              data: {
                productId: created.id,
                fileName,
                originalName: document.originalName,
                url: "",
                mimeType: document.mimeType,
                sizeBytes: bytes,
              },
              select: { id: true },
            });
            await tx.productDocument.update({
              where: { id: row.id },
              data: { url: `/api/backend/products/document/${row.id}` },
            });
          }
        },
        { timeout: 60_000 },
      );
      report.productsCreated += 1;
      report.imagesWritten += product.images.length;
      report.documentsWritten += product.documents.length;
    } catch (error) {
      report.productsFailed.push({ sku: product.sku, error: String(error) });
    }
  }

  const reportPath = path.join(
    bundleDir,
    dryRun ? "import-report.dry-run.json" : "import-report.json",
  );
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  logStep(`${dryRun ? "[DRY RUN] " : ""}Done. Report: ${reportPath}`);
  console.log({
    ...report,
    categoriesCreated: report.categoriesCreated.length,
    categoriesReused: report.categoriesReused.length,
    productsFailed: report.productsFailed.length,
    skuConflicts: report.skuConflicts.length,
  });
  if (report.productsFailed.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
