-- Admin-managed "Nachbestellen" (needs restock) flag on products (#111).
ALTER TABLE "Product" ADD COLUMN "needsReorder" BOOLEAN NOT NULL DEFAULT false;
