// Shared helpers for the two-step legacy import:
//   1. scripts/extract-virtuemart-bundle.mjs  (VirtueMart MySQL + media dir → bundle dir)
//   2. scripts/import-catalog-bundle.mjs      (bundle dir → Postgres + public/data/uploads)
//
// Bundle layout:
//   <bundle>/catalog.json   — see BUNDLE_VERSION / the JSDoc types below
//   <bundle>/files/...      — images and documents, referenced by relative path

export const BUNDLE_VERSION = 1;

/**
 * @typedef {{ file: string, altText: string, sortOrder: number }} BundleImage
 * @typedef {{ file: string, originalName: string, mimeType: string, sourceUrl?: string }} BundleDocument
 * @typedef {{
 *   legacyId: number,
 *   sku: string,
 *   name: string,
 *   description: string | null,
 *   price: string,
 *   quantityOnHand: string,
 *   minimumQuantity: string,
 *   unitKind: string,
 *   baseUnit: string,
 *   unitStep: string,
 *   categories: string[],
 *   images: BundleImage[],
 *   documents: BundleDocument[],
 * }} BundleProduct
 * @typedef {{
 *   version: number,
 *   extractedAt: string,
 *   source: Record<string, unknown>,
 *   storageRoom: string,
 *   storageLocation: { code: string, name: string },
 *   fallbackCategory: string,
 *   products: BundleProduct[],
 * }} CatalogBundle
 */

/**
 * Minimal `--flag value` / `--flag` parser. Returns a Map of flag → value ("true" for bare flags).
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  /** @type {Map<string, string>} */
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq !== -1) {
      args.set(token.slice(2, eq), token.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      args.set(token.slice(2), next);
      i += 1;
    } else {
      args.set(token.slice(2), "true");
    }
  }
  return args;
}

/**
 * @param {string} message
 */
export function logStep(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

/**
 * @param {unknown} value
 */
export function normalizeText(value) {
  return String(value ?? "").trim();
}

/**
 * @param {string} value
 */
export function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

/**
 * Converts legacy HTML to plain text, keeping paragraph breaks and turning
 * `<a href="X">Label</a>` into `Label: X` so links survive.
 * @param {unknown} html
 */
export function htmlToText(html) {
  const raw = normalizeText(html);
  if (!raw) return "";
  const text = raw
    .replace(
      /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_m, href, label) => {
        const cleanLabel = normalizeText(String(label).replace(/<[^>]*>/g, ""));
        const cleanHref = decodeEntities(String(href)).trim();
        return cleanLabel && cleanLabel !== cleanHref
          ? `${cleanLabel}: ${cleanHref}`
          : cleanHref;
      },
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]*>/g, " ");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * Extracts all href targets from legacy HTML (entity-decoded, de-duplicated).
 * @param {unknown} html
 */
export function extractLinks(html) {
  const raw = normalizeText(html);
  /** @type {string[]} */
  const links = [];
  for (const match of raw.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
    const href = decodeEntities(match[1] ?? "").trim();
    if (/^https?:\/\//i.test(href) && !links.includes(href)) links.push(href);
  }
  return links;
}

/**
 * @param {string} value
 */
export function slugify(value) {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Filesystem/URL-safe path segment.
 * @param {string} value
 */
export function safeSegment(value) {
  const normalized = value.replace(/[^a-zA-Z0-9._-]/g, "_");
  return normalized.length > 0 ? normalized : "unknown";
}

/**
 * Same sanitising as the product document upload route, so imported files look like uploaded ones.
 * @param {string} value
 */
export function sanitizeFileBase(value) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
}

/**
 * @param {unknown} raw
 * @param {number} fallback
 */
export function toNumber(raw, fallback = 0) {
  const parsed = Number.parseFloat(String(raw ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}
