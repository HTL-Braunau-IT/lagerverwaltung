-- Material templates + product geometry for calculated price-per-unit (#112, #113).
CREATE TYPE "MaterialProfile" AS ENUM ('ROUND_BAR', 'RECT_BAR');

CREATE TABLE "MaterialTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "density" DECIMAL(10,4) NOT NULL,
    "pricePerKg" DECIMAL(12,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaterialTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaterialTemplate_name_key" ON "MaterialTemplate"("name");
CREATE INDEX "MaterialTemplate_isActive_idx" ON "MaterialTemplate"("isActive");

ALTER TABLE "Product"
    ADD COLUMN "materialProfile" "MaterialProfile",
    ADD COLUMN "diameterMm" DECIMAL(14,3),
    ADD COLUMN "widthMm" DECIMAL(14,3),
    ADD COLUMN "heightMm" DECIMAL(14,3),
    ADD COLUMN "materialTemplateId" TEXT;

CREATE INDEX "Product_materialTemplateId_idx" ON "Product"("materialTemplateId");
ALTER TABLE "Product" ADD CONSTRAINT "Product_materialTemplateId_fkey" FOREIGN KEY ("materialTemplateId") REFERENCES "MaterialTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed common materials (density g/cm³; price per kg is a placeholder admins can edit).
INSERT INTO "MaterialTemplate" ("id", "name", "density", "pricePerKg", "updatedAt") VALUES
    ('mat_aluminium', 'Aluminium', 2.7000, 4.5000, now()),
    ('mat_stahl', 'Stahl', 7.8500, 1.5000, now()),
    ('mat_edelstahl', 'Edelstahl', 7.9000, 6.0000, now()),
    ('mat_messing', 'Messing', 8.5000, 9.0000, now()),
    ('mat_kupfer', 'Kupfer', 8.9600, 10.0000, now())
ON CONFLICT ("name") DO NOTHING;
