import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, OrderStatus } from "@prisma/client";

if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
  const envPath = path.resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

const args = process.argv.slice(2);

function readArg(flag, fallback = null) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx === args.length - 1) return fallback;
  return args[idx + 1];
}

function hasFlag(flag) {
  return args.includes(flag);
}

const dumpPath = path.resolve(process.cwd(), readArg("--dump", "dump-lager.sql"));
const dryRun = hasFlag("--write") ? false : true;
const strict = hasFlag("--strict");
const reportPath = path.resolve(
  process.cwd(),
  readArg("--report", "scripts/import-legacy-transactions.report.json"),
);
const fallbackUserEmail = process.env.LEGACY_IMPORT_FALLBACK_USER_EMAIL ?? null;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const statusMap = new Map([
  ["P", OrderStatus.OPEN],
  ["C", OrderStatus.PREPARING],
  ["S", OrderStatus.READY_FOR_PICKUP],
]);

const report = {
  dryRun,
  strict,
  dumpPath,
  counts: {
    costCentersCreated: 0,
    costCentersUpdated: 0,
    productsCreated: 0,
    productsUpdated: 0,
    ordersCreated: 0,
    orderItemsCreated: 0,
    stockBookingsCreated: 0,
  },
  unresolved: [],
};

function logStep(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function toNullableText(value) {
  const text = normalizeText(value);
  return text.length > 0 ? text : null;
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseSqlValue(raw) {
  const value = raw.trim();
  if (value.toUpperCase() === "NULL") return null;
  if (value.startsWith("'") && value.endsWith("'")) {
    return value
      .slice(1, -1)
      .replace(/\\'/g, "'")
      .replace(/\\r/g, "\r")
      .replace(/\\n/g, "\n")
      .replace(/\\\\/g, "\\");
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  return value;
}

function splitTuple(tupleContent) {
  const result = [];
  let current = "";
  let inString = false;
  let escaped = false;
  for (const ch of tupleContent) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      current += ch;
      escaped = true;
      continue;
    }
    if (ch === "'") {
      inString = !inString;
      current += ch;
      continue;
    }
    if (ch === "," && !inString) {
      result.push(parseSqlValue(current));
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.length > 0) {
    result.push(parseSqlValue(current));
  }
  return result;
}

function extractTuples(statement) {
  const tuples = [];
  let idx = statement.indexOf("VALUES");
  if (idx === -1) return tuples;
  idx += "VALUES".length;
  let inString = false;
  let escaped = false;
  let depth = 0;
  let buffer = "";
  for (; idx < statement.length; idx += 1) {
    const ch = statement[idx];
    if (escaped) {
      if (depth > 0) buffer += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      if (depth > 0) buffer += ch;
      escaped = true;
      continue;
    }
    if (ch === "'") {
      inString = !inString;
      if (depth > 0) buffer += ch;
      continue;
    }
    if (!inString && ch === "(") {
      depth += 1;
      if (depth === 1) {
        buffer = "";
        continue;
      }
    }
    if (!inString && ch === ")") {
      depth -= 1;
      if (depth === 0) {
        tuples.push(splitTuple(buffer));
        buffer = "";
        continue;
      }
    }
    if (depth > 0) {
      buffer += ch;
    }
  }
  return tuples;
}

function extractInsertRows(content, tableName) {
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`INSERT INTO \`${escaped}\` VALUES ([\\s\\S]*?);`, "g");
  const rows = [];
  for (const match of content.matchAll(regex)) {
    const statement = `INSERT INTO \`${tableName}\` VALUES ${match[1]};`;
    rows.push(...extractTuples(statement));
  }
  return rows;
}

function parseLegacyData(content) {
  const rows = {
    paymentMethods: extractInsertRows(content, "fs2xc_virtuemart_paymentmethods_de_de"),
    products: extractInsertRows(content, "fs2xc_virtuemart_products"),
    productsDe: extractInsertRows(content, "fs2xc_virtuemart_products_de_de"),
    productPrices: extractInsertRows(content, "fs2xc_virtuemart_product_prices"),
    categoriesDe: extractInsertRows(content, "fs2xc_virtuemart_categories_de_de"),
    productCategories: extractInsertRows(content, "fs2xc_virtuemart_product_categories"),
    orders: extractInsertRows(content, "fs2xc_virtuemart_orders"),
    orderItems: extractInsertRows(content, "fs2xc_virtuemart_order_items"),
    orderUserinfos: extractInsertRows(content, "fs2xc_virtuemart_order_userinfos"),
    orderHistories: extractInsertRows(content, "fs2xc_virtuemart_order_histories"),
    stockIn: extractInsertRows(content, "custom_einbuchen"),
  };
  return rows;
}

function asDate(value) {
  const text = normalizeText(value);
  if (!text || text.startsWith("0000-00-00")) return null;
  const date = new Date(text);
  return Number.isNaN(date.valueOf()) ? null : date;
}

async function main() {
  logStep(`Loading dump file: ${dumpPath}`);
  const sqlContent = await readFile(dumpPath, "utf8");
  const legacy = parseLegacyData(sqlContent);
  logStep("Parsed legacy insert rows");

  const storageRoom = await prisma.storageRoom.upsert({
    where: { name: "Lager" },
    update: {},
    create: { name: "Lager" },
    select: { id: true },
  });

  const existingUsers = await prisma.user.findMany({
    select: { id: true, email: true },
  });
  const userByEmail = new Map(
    existingUsers
      .filter((u) => u.email)
      .map((u) => [String(u.email).trim().toLowerCase(), u.id]),
  );

  let fallbackUserId = null;
  if (fallbackUserEmail) {
    fallbackUserId = userByEmail.get(fallbackUserEmail.toLowerCase()) ?? null;
  }
  if (!fallbackUserId && existingUsers.length > 0) {
    fallbackUserId = existingUsers[0].id;
  }

  if (!fallbackUserId) {
    throw new Error("No users in target DB. Create at least one user before import.");
  }

  const categoryByLegacyId = new Map();
  for (const row of legacy.categoriesDe) {
    const legacyId = Number(row[0]);
    const name = normalizeText(row[1]);
    if (!name) continue;
    const slug = slugify(row[6] || name) || `legacy-category-${legacyId}`;
    if (!dryRun) {
      const saved = await prisma.category.upsert({
        where: { name },
        update: { slug },
        create: { name, slug },
        select: { id: true },
      });
      categoryByLegacyId.set(legacyId, saved.id);
    } else {
      categoryByLegacyId.set(legacyId, `dry-${legacyId}`);
    }
  }

  const productNameByLegacyId = new Map();
  const productDescByLegacyId = new Map();
  for (const row of legacy.productsDe) {
    productNameByLegacyId.set(Number(row[0]), normalizeText(row[3]));
    productDescByLegacyId.set(Number(row[0]), toNullableText(row[2]) ?? toNullableText(row[1]));
  }

  const productPriceByLegacyId = new Map();
  for (const row of legacy.productPrices) {
    const legacyProductId = Number(row[1]);
    const price = toNumber(row[3], 0);
    const current = productPriceByLegacyId.get(legacyProductId);
    if (current === undefined || price < current) {
      productPriceByLegacyId.set(legacyProductId, price);
    }
  }

  const productCategories = new Map();
  for (const row of legacy.productCategories) {
    const legacyProductId = Number(row[1]);
    const legacyCategoryId = Number(row[2]);
    const list = productCategories.get(legacyProductId) ?? [];
    list.push(legacyCategoryId);
    productCategories.set(legacyProductId, list);
  }

  const orderReferencedProductIds = new Set(
    legacy.orderItems
      .map((row) => Number(row[3]))
      .filter((id) => Number.isFinite(id) && id > 0),
  );

  const productByLegacyId = new Map();
  const productBySku = new Map();
  const existingProducts = await prisma.product.findMany({
    select: { id: true, sku: true },
  });
  for (const product of existingProducts) {
    productBySku.set(product.sku, product.id);
  }

  for (const row of legacy.products) {
    const legacyProductId = Number(row[0]);
    const sku = normalizeText(row[3]) || `VM-${legacyProductId}`;
    const name = productNameByLegacyId.get(legacyProductId) || `Legacy Product ${legacyProductId}`;
    const description = productDescByLegacyId.get(legacyProductId) ?? null;
    const quantityOnHand = toNumber(row[14], 0).toFixed(3);
    const minimumQuantity = toNumber(row[17], 0).toFixed(3);
    const price = toNumber(productPriceByLegacyId.get(legacyProductId), 0).toFixed(2);
    const primaryCategoryId = (productCategories.get(legacyProductId) ?? [])
      .map((legacyCategoryId) => categoryByLegacyId.get(legacyCategoryId))
      .find(Boolean);
    const published = Number(row[32]) === 1;

    const isOrderReferenced = orderReferencedProductIds.has(legacyProductId);
    if (!published && !isOrderReferenced) {
      continue;
    }

    if (!dryRun) {
      const existingId = productBySku.get(sku) ?? null;
      let savedId = existingId;
      if (existingId) {
        await prisma.product.update({
          where: { id: existingId },
          data: {
            name,
            description,
            price,
            quantityOnHand,
            minimumQuantity,
            categoryId: primaryCategoryId ?? null,
          },
        });
        report.counts.productsUpdated += 1;
      } else {
        const created = await prisma.product.create({
          data: {
            sku,
            name,
            description,
            price,
            quantityOnHand,
            minimumQuantity,
            categoryId: primaryCategoryId ?? null,
            unitKind: "PIECE",
            baseUnit: "PCS",
            unitStep: "1.000",
          },
          select: { id: true },
        });
        savedId = created.id;
        report.counts.productsCreated += 1;
      }

      for (const legacyCategoryId of productCategories.get(legacyProductId) ?? []) {
        const mappedCategoryId = categoryByLegacyId.get(legacyCategoryId);
        if (!mappedCategoryId) continue;
        await prisma.productCategory.upsert({
          where: {
            productId_categoryId: {
              productId: savedId,
              categoryId: mappedCategoryId,
            },
          },
          update: {},
          create: {
            productId: savedId,
            categoryId: mappedCategoryId,
          },
        });
      }

      productByLegacyId.set(legacyProductId, savedId);
      productBySku.set(sku, savedId);
    } else {
      productByLegacyId.set(legacyProductId, `dry-product-${legacyProductId}`);
    }
  }

  const costCenterByLegacyPaymentMethodId = new Map();
  for (const row of legacy.paymentMethods) {
    const legacyPaymentMethodId = Number(row[0]);
    const name = normalizeText(row[1]) || `Legacy Payment ${legacyPaymentMethodId}`;
    const codeCandidate = normalizeText(row[2]);
    const code = (codeCandidate || slugify(name).toUpperCase()).slice(0, 64) || `PAY-${legacyPaymentMethodId}`;
    if (!dryRun) {
      const existing = await prisma.costCenter.findUnique({
        where: { code },
        select: { id: true },
      });
      if (existing) {
        await prisma.costCenter.update({
          where: { id: existing.id },
          data: { name },
          select: { id: true },
        });
        costCenterByLegacyPaymentMethodId.set(legacyPaymentMethodId, existing.id);
        report.counts.costCentersUpdated += 1;
      } else {
        const created = await prisma.costCenter.create({
          data: { code, name },
          select: { id: true },
        });
        costCenterByLegacyPaymentMethodId.set(legacyPaymentMethodId, created.id);
        report.counts.costCentersCreated += 1;
      }
    } else {
      costCenterByLegacyPaymentMethodId.set(legacyPaymentMethodId, `dry-cost-center-${legacyPaymentMethodId}`);
    }
  }

  if (!costCenterByLegacyPaymentMethodId.has(0)) {
    if (!dryRun) {
      const legacyFallbackCode = "LEGACY-UNKNOWN";
      const existing = await prisma.costCenter.findUnique({
        where: { code: legacyFallbackCode },
        select: { id: true },
      });
      if (existing) {
        costCenterByLegacyPaymentMethodId.set(0, existing.id);
      } else {
        const created = await prisma.costCenter.create({
          data: {
            code: legacyFallbackCode,
            name: "Legacy Unknown Payment Method",
          },
          select: { id: true },
        });
        costCenterByLegacyPaymentMethodId.set(0, created.id);
        report.counts.costCentersCreated += 1;
      }
    } else {
      costCenterByLegacyPaymentMethodId.set(0, "dry-cost-center-0");
    }
  }

  const orderEmailByLegacyOrderId = new Map();
  for (const row of legacy.orderUserinfos) {
    const legacyOrderId = Number(row[1]);
    const email = normalizeText(row[19]).toLowerCase();
    if (email) {
      orderEmailByLegacyOrderId.set(legacyOrderId, email);
    }
  }

  const orderStatusByLegacyOrderId = new Map();
  for (const row of legacy.orderHistories) {
    const legacyOrderId = Number(row[1]);
    const code = normalizeText(row[2]);
    if (statusMap.has(code)) {
      orderStatusByLegacyOrderId.set(legacyOrderId, statusMap.get(code));
    }
  }

  const existingOrders = await prisma.order.findMany({
    select: { id: true, orderNumber: true },
  });
  const orderIdByNumber = new Map(existingOrders.map((o) => [o.orderNumber, o.id]));
  const createdOrderByLegacyId = new Map();

  for (const row of legacy.orders) {
    const legacyOrderId = Number(row[0]);
    const legacyOrderNumber = normalizeText(row[4]);
    const orderNumber = legacyOrderNumber || `VM-${legacyOrderId}`;
    const legacyStatus = normalizeText(row[25]);
    const status =
      orderStatusByLegacyOrderId.get(legacyOrderId) ??
      statusMap.get(legacyStatus) ??
      OrderStatus.OPEN;
    const workerNote = toNullableText(row[3]);
    const createdAt = asDate(row[40]) ?? new Date();
    const legacyPaymentMethodId = Number(row[31]);
    const costCenterId = costCenterByLegacyPaymentMethodId.get(legacyPaymentMethodId);
    const email = orderEmailByLegacyOrderId.get(legacyOrderId) ?? null;
    const userId = (email && userByEmail.get(email)) || fallbackUserId;

    if (!costCenterId) {
      report.unresolved.push({
        entity: "order",
        reason: "missing-cost-center",
        legacyOrderId,
        legacyPaymentMethodId,
      });
      if (strict) {
        throw new Error(`Missing cost center for order ${legacyOrderId}`);
      }
      continue;
    }

    if (!userId) {
      report.unresolved.push({
        entity: "order",
        reason: "missing-user",
        legacyOrderId,
        email,
      });
      if (strict) {
        throw new Error(`Missing user for order ${legacyOrderId}`);
      }
      continue;
    }

    if (!dryRun) {
      const existingOrderId = orderIdByNumber.get(orderNumber) ?? null;
      if (existingOrderId) {
        createdOrderByLegacyId.set(legacyOrderId, existingOrderId);
        continue;
      }
      const created = await prisma.order.create({
        data: {
          orderNumber,
          userId,
          costCenterId,
          storageRoomId: storageRoom.id,
          workerNote,
          status,
          createdAt,
        },
        select: { id: true },
      });
      orderIdByNumber.set(orderNumber, created.id);
      createdOrderByLegacyId.set(legacyOrderId, created.id);
      report.counts.ordersCreated += 1;
    } else {
      createdOrderByLegacyId.set(legacyOrderId, `dry-order-${legacyOrderId}`);
    }
  }

  for (const row of legacy.orderItems) {
    const legacyOrderId = Number(row[1]);
    const legacyProductId = Number(row[3]);
    const quantity = toNumber(row[6], 0).toFixed(3);
    const orderId = createdOrderByLegacyId.get(legacyOrderId);
    const itemSku = normalizeText(row[4]);
    const productId = productByLegacyId.get(legacyProductId) ?? productBySku.get(itemSku);

    if (!orderId || !productId) {
      report.unresolved.push({
        entity: "order-item",
        reason: !orderId ? "missing-order" : "missing-product",
        legacyOrderId,
        legacyProductId,
        itemSku,
      });
      if (strict) {
        throw new Error(`Missing dependencies for order item order=${legacyOrderId} product=${legacyProductId}`);
      }
      continue;
    }

    if (!dryRun) {
      await prisma.orderItem.upsert({
        where: {
          orderId_productId: {
            orderId,
            productId,
          },
        },
        update: {
          quantity,
        },
        create: {
          orderId,
          productId,
          quantity,
        },
      });
      report.counts.orderItemsCreated += 1;
    }
  }

  // Stock-in rows are stored as positive quantity deltas.
  for (const row of legacy.stockIn) {
    const sku = normalizeText(row[1]);
    const qty = toNumber(row[2], 0);
    const supplier = normalizeText(row[3]) || "Legacy import";
    const createdAt = asDate(row[4]) ?? new Date();
    if (!sku || qty === 0) continue;
    const productId = productBySku.get(sku);
    if (!productId) {
      report.unresolved.push({
        entity: "stock-booking",
        reason: "missing-product",
        sku,
      });
      if (strict) {
        throw new Error(`Missing product for stock booking SKU=${sku}`);
      }
      continue;
    }
    if (!dryRun) {
      await prisma.productStockBooking.create({
        data: {
          productId,
          userId: fallbackUserId,
          quantityDelta: qty.toFixed(3),
          supplier,
          note: "Legacy stock-in import",
          createdAt,
        },
      });
      report.counts.stockBookingsCreated += 1;
    }
  }

  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  logStep(`Done. Report written to ${reportPath}`);
  console.log(report);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
