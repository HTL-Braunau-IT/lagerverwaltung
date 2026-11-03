-- Make Product.categoryId required (#100).
-- Backfill existing null-primary products before enforcing NOT NULL:
--   1) promote an existing many-to-many category link to primary where available,
--   2) assign the rest to a default "Allgemein" category.

-- Ensure the default category exists (slug left NULL to avoid any slug collision).
INSERT INTO "Category" ("id", "name", "slug", "createdAt", "updatedAt")
VALUES ('cat_allgemein_default', 'Allgemein', NULL, now(), now())
ON CONFLICT ("name") DO NOTHING;

-- 1) Promote a linked category to primary for products that have links but no primary.
UPDATE "Product" p
SET "categoryId" = pc."categoryId"
FROM (
    SELECT DISTINCT ON ("productId") "productId", "categoryId"
    FROM "ProductCategory"
    ORDER BY "productId", "categoryId"
) pc
WHERE p."categoryId" IS NULL AND p."id" = pc."productId";

-- 2) Assign any remaining uncategorized products to "Allgemein".
UPDATE "Product"
SET "categoryId" = (SELECT "id" FROM "Category" WHERE "name" = 'Allgemein' LIMIT 1)
WHERE "categoryId" IS NULL;

-- Enforce the requirement and switch the FK from SET NULL to RESTRICT
-- (SET NULL is invalid for a required column).
ALTER TABLE "Product" DROP CONSTRAINT "Product_categoryId_fkey";
ALTER TABLE "Product" ALTER COLUMN "categoryId" SET NOT NULL;
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
