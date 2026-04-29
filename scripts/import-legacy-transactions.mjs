import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { AppRole, PrismaClient, OrderStatus } from "@prisma/client";

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
const legacyEmailAliasRaw = process.env.LEGACY_EMAIL_ALIASES_JSON ?? "{}";

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
    usersCreated: 0,
    usersMatchedViaEntra: 0,
    usersMatchedViaLogin: 0,
    usersMatchedViaNameHeuristic: 0,
    userRolesUpdated: 0,
    ordersUsingFallbackUser: 0,
    costCentersCreated: 0,
    costCentersUpdated: 0,
    productsCreated: 0,
    productsUpdated: 0,
    ordersCreated: 0,
    orderItemsCreated: 0,
    stockBookingsCreated: 0,
  },
  unresolved: [],
  fallbackUserAssignments: [],
};
const UNKNOWN_USER_AZURE_OBJECT_ID = "legacy-unknown-user";

function logStep(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function canonicalizeLegacyEmail(value) {
  const email = normalizeEmail(value);
  if (!email || !email.includes("@")) return null;
  if (email === "123@123.de") return null;

  let normalized = email.replace(/\s+/g, "");
  normalized = normalized
    .replace(/@htlbraunauat\.at$/i, "@htl-braunau.at")
    .replace(/@htlbraunau\.at$/i, "@htl-braunau.at")
    .replace(/@htl-braunauat\.at$/i, "@htl-braunau.at")
    .replace(/@htl-braunau\.at\.at$/i, "@htl-braunau.at");

  if (!normalized.includes("@")) return null;
  return normalized;
}

function normalizeLogin(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, "");
}

function normalizeNameToken(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * @param {string | null | undefined} firstName
 * @param {string | null | undefined} lastName
 */
function buildNameHeuristicLocalParts(firstName, lastName) {
  const first = normalizeNameToken(firstName);
  const last = normalizeNameToken(lastName);
  if (!first || !last) return [];
  const firstInitial = first[0];
  // f.lastname and lastnamef variants (dot and no-dot forms)
  const candidates = [
    `${firstInitial}.${last}`,
    `${firstInitial}${last}`,
    `${last}${firstInitial}`,
    `${last}.${firstInitial}`,
  ];
  return [...new Set(candidates.map((c) => normalizeLogin(c)).filter(Boolean))];
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
  const rows = [];
  const marker = `INSERT INTO \`${tableName}\` VALUES `;
  let cursor = 0;
  while (cursor < content.length) {
    const start = content.indexOf(marker, cursor);
    if (start === -1) break;

    let idx = start + marker.length;
    let inString = false;
    let escaped = false;
    while (idx < content.length) {
      const ch = content[idx];
      if (escaped) {
        escaped = false;
        idx += 1;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        idx += 1;
        continue;
      }
      if (ch === "'") {
        inString = !inString;
        idx += 1;
        continue;
      }
      if (!inString && ch === ";") {
        idx += 1;
        break;
      }
      idx += 1;
    }

    const statement = content.slice(start, idx);
    rows.push(...extractTuples(statement));
    cursor = idx;
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
    users: extractInsertRows(content, "fs2xc_users"),
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

function buildLegacyIdentityNote({ email, loginCandidate, firstName, lastName }) {
  const details = [];
  if (email) details.push(`email=${email}`);
  if (loginCandidate) details.push(`login=${loginCandidate}`);
  if (firstName || lastName) details.push(`name=${[firstName, lastName].filter(Boolean).join(" ").trim()}`);
  if (details.length === 0) return "Legacy user unresolved";
  return `Legacy user unresolved (${details.join(", ")})`;
}

function mergeWorkerNote(workerNote, legacyIdentityNote) {
  const base = normalizeText(workerNote);
  if (!legacyIdentityNote) return base || null;
  if (!base) return legacyIdentityNote;
  if (base.includes(legacyIdentityNote)) return base;
  return `${base} | ${legacyIdentityNote}`;
}

async function fetchEntraUsers() {
  const tenantId = process.env.ENTRA_TENANT_ID ?? process.env.AZURE_AD_TENANT_ID;
  const clientId = process.env.ENTRA_CLIENT_ID ?? process.env.AZURE_AD_CLIENT_ID;
  const clientSecret = process.env.ENTRA_CLIENT_SECRET ?? process.env.AZURE_AD_CLIENT_SECRET;
  const roleGroupIds = {
    admin: normalizeText(process.env.ROLE_ADMIN_GROUP_ID),
    teacher: normalizeText(process.env.ROLE_TEACHER_GROUP_ID),
    student: normalizeText(process.env.ROLE_STUDENT_GROUP_ID),
  };

  if (!tenantId || !clientId || !clientSecret) {
    return { users: [], roleByEntraId: new Map() };
  }

  const tokenResponse = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );

  if (!tokenResponse.ok) {
    throw new Error(`Failed to fetch Entra token (${tokenResponse.status})`);
  }

  const tokenPayload = await tokenResponse.json();
  const accessToken = tokenPayload.access_token;
  if (!accessToken) {
    throw new Error("Entra token response did not include access_token");
  }

  /** @type {Array<{id: string, displayName: string | null, mail: string | null, userPrincipalName: string | null, mailNickname: string | null}>} */
  const users = [];
  let nextUrl =
    "https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,mailNickname&$top=999";

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch Entra users (${response.status})`);
    }
    const payload = await response.json();
    users.push(...(payload.value ?? []));
    nextUrl = payload["@odata.nextLink"] ?? null;
  }

  /** @type {Map<string, AppRole>} */
  const roleByEntraId = new Map();
  const rolePriority = [AppRole.STUDENT, AppRole.TEACHER, AppRole.ADMIN];

  /**
   * @param {string} groupId
   */
  async function fetchGroupMemberIds(groupId) {
    /** @type {string[]} */
    const memberIds = [];
    let nextUrl = `https://graph.microsoft.com/v1.0/groups/${encodeURIComponent(groupId)}/members?$select=id&$top=999`;
    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) {
        if (response.status === 404) {
          logStep(`Entra group not found, skipping role group: ${groupId}`);
          return memberIds;
        }
        throw new Error(`Failed to fetch Entra group members (${groupId}, ${response.status})`);
      }
      const payload = await response.json();
      for (const member of payload.value ?? []) {
        if (member?.id) {
          memberIds.push(member.id);
        }
      }
      nextUrl = payload["@odata.nextLink"] ?? null;
    }
    return memberIds;
  }

  const groupMappings = [
    { groupId: roleGroupIds.student, role: AppRole.STUDENT },
    { groupId: roleGroupIds.teacher, role: AppRole.TEACHER },
    { groupId: roleGroupIds.admin, role: AppRole.ADMIN },
  ].filter((entry) => entry.groupId.length > 0);

  for (const mapping of groupMappings) {
    const memberIds = await fetchGroupMemberIds(mapping.groupId);
    for (const memberId of memberIds) {
      const currentRole = roleByEntraId.get(memberId);
      if (!currentRole) {
        roleByEntraId.set(memberId, mapping.role);
        continue;
      }
      if (rolePriority.indexOf(mapping.role) > rolePriority.indexOf(currentRole)) {
        roleByEntraId.set(memberId, mapping.role);
      }
    }
  }

  return { users, roleByEntraId };
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
    select: { id: true, email: true, azureAdObjectId: true, role: true },
  });

  const existingUsersByAzureId = new Map(
    (
      existingUsers
    )
      .filter((u) => u.azureAdObjectId)
      .map((u) => [u.azureAdObjectId, u.id]),
  );
  const existingRoleByUserId = new Map(existingUsers.map((u) => [u.id, u.role]));

  const userByEmail = new Map(
    existingUsers
      .filter((u) => u.email)
      .map((u) => [canonicalizeLegacyEmail(u.email), u.id])
      .filter((entry) => entry[0]),
  );
  const userByLogin = new Map();
  const userByEmailLocalPart = new Map();
  for (const user of existingUsers) {
    const email = canonicalizeLegacyEmail(user.email);
    if (email) {
      const localPart = normalizeLogin(email.split("@")[0]);
      if (localPart) {
        userByLogin.set(localPart, user.id);
        userByEmailLocalPart.set(localPart, user.id);
      }
    }
  }

  let entraUsers = [];
  /** @type {Map<string, AppRole>} */
  let entraRoleById = new Map();
  try {
    const entraData = await fetchEntraUsers();
    entraUsers = entraData.users;
    entraRoleById = entraData.roleByEntraId;
    if (entraUsers.length > 0) {
      logStep(`Fetched ${entraUsers.length} users from Entra`);
    } else {
      logStep("No Entra credentials configured; using local DB users only");
    }
  } catch (error) {
    logStep(`Failed Entra pull, continuing with local users only: ${String(error)}`);
  }

  const entraByEmail = new Map();
  const entraByLogin = new Map();
  const entraByEmailLocalPart = new Map();
  for (const entraUser of entraUsers) {
    const mail = canonicalizeLegacyEmail(entraUser.mail);
    const upn = canonicalizeLegacyEmail(entraUser.userPrincipalName);
    const mailNickname = normalizeLogin(entraUser.mailNickname);
    if (mail) entraByEmail.set(mail, entraUser);
    if (upn) entraByEmail.set(upn, entraUser);
    if (mail) {
      const mailLocalPart = normalizeLogin(mail.split("@")[0]);
      if (mailLocalPart) entraByEmailLocalPart.set(mailLocalPart, entraUser);
    }
    if (upn) {
      const upnLocalPart = normalizeLogin(upn.split("@")[0]);
      if (upnLocalPart) entraByEmailLocalPart.set(upnLocalPart, entraUser);
    }
    if (upn) {
      const upnLocalPart = normalizeLogin(upn.split("@")[0]);
      if (upnLocalPart) entraByLogin.set(upnLocalPart, entraUser);
    }
    if (mailNickname) entraByLogin.set(mailNickname, entraUser);
  }

  /** @type {Record<string, string>} */
  let legacyEmailAliases = {};
  try {
    const parsed = JSON.parse(legacyEmailAliasRaw);
    if (parsed && typeof parsed === "object") {
      legacyEmailAliases = parsed;
    }
  } catch {
    logStep("Could not parse LEGACY_EMAIL_ALIASES_JSON, ignoring aliases");
  }

  /** @type {Map<string, string>} */
  const canonicalAliasMap = new Map(
    Object.entries(legacyEmailAliases)
      .map(([source, target]) => [canonicalizeLegacyEmail(source), canonicalizeLegacyEmail(target)])
      .filter(([source, target]) => source && target),
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

  let unknownUserId = null;
  if (!dryRun) {
    const existingUnknown = await prisma.user.findUnique({
      where: { azureAdObjectId: UNKNOWN_USER_AZURE_OBJECT_ID },
      select: { id: true },
    });
    if (existingUnknown) {
      unknownUserId = existingUnknown.id;
    } else {
      const createdUnknown = await prisma.user.create({
        data: {
          azureAdObjectId: UNKNOWN_USER_AZURE_OBJECT_ID,
          name: "Unbekannter Benutzer",
          role: AppRole.STUDENT,
        },
        select: { id: true },
      });
      unknownUserId = createdUnknown.id;
    }
  } else {
    unknownUserId = "dry-unknown-user";
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
  const orderLegacyUserIdByOrderId = new Map();
  const orderNameByOrderId = new Map();
  for (const row of legacy.orderUserinfos) {
    const legacyOrderId = Number(row[1]);
    const legacyUserId = Number(row[2]);
    const rawEmail = canonicalizeLegacyEmail(row[19]);
    const email = (rawEmail && canonicalAliasMap.get(rawEmail)) || rawEmail;
    if (email) {
      orderEmailByLegacyOrderId.set(legacyOrderId, email);
    }
    const firstName = normalizeText(row[8]);
    const lastName = normalizeText(row[7]);
    if (firstName || lastName) {
      orderNameByOrderId.set(legacyOrderId, { firstName, lastName });
    }
    if (Number.isFinite(legacyUserId) && legacyUserId > 0) {
      orderLegacyUserIdByOrderId.set(legacyOrderId, legacyUserId);
    }
  }

  /** @type {Map<number, { username: string | null, email: string | null }>} */
  const legacyUserById = new Map();
  for (const row of legacy.users) {
    const legacyUserId = Number(row[0]);
    const username = normalizeLogin(row[2]);
    const email = canonicalizeLegacyEmail(row[3]);
    legacyUserById.set(legacyUserId, { username: username || null, email });
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
    const legacyOrderUserId =
      orderLegacyUserIdByOrderId.get(legacyOrderId) ??
      (Number.isFinite(Number(row[1])) ? Number(row[1]) : null);
    const legacyUser = legacyOrderUserId ? legacyUserById.get(legacyOrderUserId) : null;
    const loginCandidate = legacyUser?.username ?? null;
    const orderName = orderNameByOrderId.get(legacyOrderId);
    let userId = (email && userByEmail.get(email)) || null;

    if (!userId && email) {
      const entraUser = entraByEmail.get(email) ?? null;
      if (entraUser?.id) {
        const mappedRole = entraRoleById.get(entraUser.id) ?? AppRole.STUDENT;
        userId = existingUsersByAzureId.get(entraUser.id) ?? null;
        if (userId && !dryRun) {
          const currentRole = existingRoleByUserId.get(userId);
          if (currentRole && currentRole !== mappedRole) {
            await prisma.user.update({
              where: { id: userId },
              data: { role: mappedRole },
            });
            existingRoleByUserId.set(userId, mappedRole);
            report.counts.userRolesUpdated += 1;
          }
        }
        if (!userId && !dryRun) {
          const created = await prisma.user.create({
            data: {
              azureAdObjectId: entraUser.id,
              email: normalizeEmail(entraUser.mail || entraUser.userPrincipalName),
              name: toNullableText(entraUser.displayName),
              role: mappedRole,
            },
            select: { id: true, email: true, azureAdObjectId: true },
          });
          userId = created.id;
          report.counts.usersCreated += 1;
          if (created.email) {
            userByEmail.set(normalizeEmail(created.email), created.id);
          }
          if (created.azureAdObjectId) {
            existingUsersByAzureId.set(created.azureAdObjectId, created.id);
          }
          existingRoleByUserId.set(created.id, mappedRole);
        }
        if (userId) {
          report.counts.usersMatchedViaEntra += 1;
        }
      }
    }

    if (!userId && loginCandidate) {
      userId = userByLogin.get(loginCandidate) ?? null;
      if (!userId) {
        const entraUser = entraByLogin.get(loginCandidate) ?? null;
        if (entraUser?.id) {
          const mappedRole = entraRoleById.get(entraUser.id) ?? AppRole.STUDENT;
          userId = existingUsersByAzureId.get(entraUser.id) ?? null;
          if (userId && !dryRun) {
            const currentRole = existingRoleByUserId.get(userId);
            if (currentRole && currentRole !== mappedRole) {
              await prisma.user.update({
                where: { id: userId },
                data: { role: mappedRole },
              });
              existingRoleByUserId.set(userId, mappedRole);
              report.counts.userRolesUpdated += 1;
            }
          }
          if (!userId && !dryRun) {
            const created = await prisma.user.create({
              data: {
                azureAdObjectId: entraUser.id,
                email: normalizeEmail(entraUser.mail || entraUser.userPrincipalName),
                name: toNullableText(entraUser.displayName),
                role: mappedRole,
              },
              select: { id: true, email: true, azureAdObjectId: true },
            });
            userId = created.id;
            report.counts.usersCreated += 1;
            if (created.email) {
              const canonicalEmail = canonicalizeLegacyEmail(created.email);
              if (canonicalEmail) {
                userByEmail.set(canonicalEmail, created.id);
                const localPart = normalizeLogin(canonicalEmail.split("@")[0]);
                if (localPart) userByLogin.set(localPart, created.id);
              }
            }
            if (created.azureAdObjectId) {
              existingUsersByAzureId.set(created.azureAdObjectId, created.id);
            }
            existingRoleByUserId.set(created.id, mappedRole);
          }
          if (userId) {
            report.counts.usersMatchedViaLogin += 1;
          }
        }
      } else {
        report.counts.usersMatchedViaLogin += 1;
      }
    }

    if (!userId && orderName) {
      const localPartCandidates = buildNameHeuristicLocalParts(orderName.firstName, orderName.lastName);
      for (const localPart of localPartCandidates) {
        userId = userByEmailLocalPart.get(localPart) ?? null;
        if (userId) {
          report.counts.usersMatchedViaNameHeuristic += 1;
          break;
        }
        const entraUser = entraByEmailLocalPart.get(localPart) ?? null;
        if (entraUser?.id) {
          const mappedRole = entraRoleById.get(entraUser.id) ?? AppRole.STUDENT;
          userId = existingUsersByAzureId.get(entraUser.id) ?? null;
          if (userId && !dryRun) {
            const currentRole = existingRoleByUserId.get(userId);
            if (currentRole && currentRole !== mappedRole) {
              await prisma.user.update({
                where: { id: userId },
                data: { role: mappedRole },
              });
              existingRoleByUserId.set(userId, mappedRole);
              report.counts.userRolesUpdated += 1;
            }
          }
          if (!userId && !dryRun) {
            const created = await prisma.user.create({
              data: {
                azureAdObjectId: entraUser.id,
                email: normalizeEmail(entraUser.mail || entraUser.userPrincipalName),
                name: toNullableText(entraUser.displayName),
                role: mappedRole,
              },
              select: { id: true, email: true, azureAdObjectId: true },
            });
            userId = created.id;
            report.counts.usersCreated += 1;
            if (created.email) {
              const canonicalEmail = canonicalizeLegacyEmail(created.email);
              if (canonicalEmail) {
                userByEmail.set(canonicalEmail, created.id);
                const createdLocalPart = normalizeLogin(canonicalEmail.split("@")[0]);
                if (createdLocalPart) {
                  userByLogin.set(createdLocalPart, created.id);
                  userByEmailLocalPart.set(createdLocalPart, created.id);
                }
              }
            }
            if (created.azureAdObjectId) {
              existingUsersByAzureId.set(created.azureAdObjectId, created.id);
            }
            existingRoleByUserId.set(created.id, mappedRole);
          }
          if (userId) {
            report.counts.usersMatchedViaNameHeuristic += 1;
            break;
          }
        }
      }
    }

    const legacyIdentityNote = buildLegacyIdentityNote({
      email,
      loginCandidate,
      firstName: orderName?.firstName ?? null,
      lastName: orderName?.lastName ?? null,
    });

    if (!userId) {
      userId = unknownUserId ?? fallbackUserId;
      report.counts.ordersUsingFallbackUser += 1;
      if (report.fallbackUserAssignments.length < 500) {
        report.fallbackUserAssignments.push({
          legacyOrderId,
          orderNumber,
          email,
          loginCandidate,
          firstName: orderName?.firstName ?? null,
          lastName: orderName?.lastName ?? null,
          reason: email ? "assigned-unknown-user-no-match" : "assigned-unknown-user-missing-email",
        });
      }
    }

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
        await prisma.order.update({
          where: { id: existingOrderId },
          data: {
            userId,
            costCenterId,
            storageRoomId: storageRoom.id,
            workerNote: mergeWorkerNote(workerNote, !email || userId === unknownUserId ? legacyIdentityNote : null),
            status,
          },
        });
        createdOrderByLegacyId.set(legacyOrderId, existingOrderId);
        continue;
      }
      const created = await prisma.order.create({
        data: {
          orderNumber,
          userId,
          costCenterId,
          storageRoomId: storageRoom.id,
          workerNote: mergeWorkerNote(
            workerNote,
            !email || userId === unknownUserId ? legacyIdentityNote : null,
          ),
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
