import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, BaseUnit, UnitKind } from "../generated/prisma/index.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

/**
 * @typedef {Object} SeedProduct
 * @property {string} sku
 * @property {string} name
 * @property {string} description
 * @property {string} price
 * @property {string} quantityOnHand
 * @property {string} minimumQuantity
 * @property {import("../generated/prisma/index.js").UnitKind} unitKind
 * @property {import("../generated/prisma/index.js").BaseUnit} baseUnit
 * @property {string} unitStep
 * @property {string} categoryId
 * @property {string} storageLocationId
 * @property {string} imageUrl
 * @property {string} imageAlt
 */

async function main() {
  const storageRooms = await Promise.all([
    prisma.storageRoom.upsert({
      where: { name: "Main Warehouse" },
      update: {},
      create: { name: "Main Warehouse" },
    }),
    prisma.storageRoom.upsert({
      where: { name: "Cold Storage" },
      update: {},
      create: { name: "Cold Storage" },
    }),
  ]);

  const storageLocations = await Promise.all([
    prisma.storageLocation.upsert({
      where: { code: "A1-01" },
      update: {},
      create: {
        code: "A1-01",
        name: "Rack A1 - Slot 01",
        description: "Dry goods and common consumables",
        storageRoomId: storageRooms[0].id,
      },
    }),
    prisma.storageLocation.upsert({
      where: { code: "C1-01" },
      update: {},
      create: {
        code: "C1-01",
        name: "Cool Rack C1 - Slot 01",
        description: "Temperature-sensitive materials",
        storageRoomId: storageRooms[1].id,
      },
    }),
  ]);

  const categories = await Promise.all([
    prisma.category.upsert({
      where: { name: "Office Supplies" },
      update: {},
      create: { name: "Office Supplies", slug: "office-supplies" },
    }),
    prisma.category.upsert({
      where: { name: "Cleaning Supplies" },
      update: {},
      create: { name: "Cleaning Supplies", slug: "cleaning-supplies" },
    }),
  ]);

  await Promise.all([
    prisma.costCenter.upsert({
      where: { code: "CC-1000" },
      update: {},
      create: { code: "CC-1000", name: "Administration" },
    }),
    prisma.costCenter.upsert({
      where: { code: "CC-2000" },
      update: {},
      create: { code: "CC-2000", name: "Operations" },
    }),
  ]);

  /** @type {SeedProduct[]} */
  const products = [
    {
      sku: "PRD-0001",
      name: "A4 Copy Paper 500 Sheets",
      description: "Standard A4 paper for printers and copiers.",
      price: "6.49",
      quantityOnHand: "120.000",
      minimumQuantity: "20.000",
      unitKind: UnitKind.PIECE,
      baseUnit: BaseUnit.PCS,
      unitStep: "1.000",
      categoryId: categories[0].id,
      storageLocationId: storageLocations[0].id,
      imageUrl: "/data/upload/pictures/seed-a4-copy-paper.jpg",
      imageAlt: "A4 copy paper package",
    },
    {
      sku: "PRD-0002",
      name: "Black Ballpoint Pens (Pack of 10)",
      description: "Smooth-writing black pens for daily office use.",
      price: "4.29",
      quantityOnHand: "85.000",
      minimumQuantity: "15.000",
      unitKind: UnitKind.PIECE,
      baseUnit: BaseUnit.PCS,
      unitStep: "1.000",
      categoryId: categories[0].id,
      storageLocationId: storageLocations[0].id,
      imageUrl: "/data/upload/pictures/seed-ballpoint-pens.jpg",
      imageAlt: "Pack of black ballpoint pens",
    },
    {
      sku: "PRD-0003",
      name: "Sticky Notes 76x76 mm",
      description: "Self-adhesive note pads in assorted colors.",
      price: "2.99",
      quantityOnHand: "64.000",
      minimumQuantity: "10.000",
      unitKind: UnitKind.PIECE,
      baseUnit: BaseUnit.PCS,
      unitStep: "1.000",
      categoryId: categories[0].id,
      storageLocationId: storageLocations[0].id,
      imageUrl: "/data/upload/pictures/seed-sticky-notes.jpg",
      imageAlt: "Colorful sticky note stack",
    },
    {
      sku: "PRD-0004",
      name: "Surface Cleaner 1L",
      description: "Multi-purpose cleaner for desks and work surfaces.",
      price: "5.79",
      quantityOnHand: "42.000",
      minimumQuantity: "8.000",
      unitKind: UnitKind.VOLUME,
      baseUnit: BaseUnit.L,
      unitStep: "0.500",
      categoryId: categories[1].id,
      storageLocationId: storageLocations[1].id,
      imageUrl: "/data/upload/pictures/seed-surface-cleaner.jpg",
      imageAlt: "Bottle of surface cleaner",
    },
    {
      sku: "PRD-0005",
      name: "Microfiber Cloth Set",
      description: "Reusable microfiber cloths for gentle cleaning.",
      price: "8.99",
      quantityOnHand: "30.000",
      minimumQuantity: "6.000",
      unitKind: UnitKind.PIECE,
      baseUnit: BaseUnit.PCS,
      unitStep: "1.000",
      categoryId: categories[1].id,
      storageLocationId: storageLocations[1].id,
      imageUrl: "/data/upload/pictures/seed-microfiber-cloth.jpg",
      imageAlt: "Folded microfiber cloths",
    },
  ];

  const additionalProductCount = 150;
  /** @type {SeedProduct[]} */
  const additionalProducts = Array.from({ length: additionalProductCount }, (_, index) => {
    const productNumber = index + 6;
    const isOfficeSupply = index % 2 === 0;
    const sku = `PRD-${String(productNumber).padStart(4, "0")}`;
    const displayNumber = String(productNumber).padStart(3, "0");

    return {
      sku,
      name: isOfficeSupply
        ? `Office Supply Item ${displayNumber}`
        : `Cleaning Supply Item ${displayNumber}`,
      description: isOfficeSupply
        ? `General office supply product ${displayNumber} for daily use.`
        : `General cleaning supply product ${displayNumber} for facility maintenance.`,
      price: (isOfficeSupply ? 1.5 + (index % 18) * 0.65 : 2.2 + (index % 20) * 0.8).toFixed(2),
      quantityOnHand: String(25 + (index % 85)).padStart(1, "0") + ".000",
      minimumQuantity: String(5 + (index % 18)).padStart(1, "0") + ".000",
      unitKind: isOfficeSupply ? UnitKind.PIECE : UnitKind.VOLUME,
      baseUnit: isOfficeSupply ? BaseUnit.PCS : BaseUnit.L,
      unitStep: isOfficeSupply ? "1.000" : "0.500",
      categoryId: isOfficeSupply ? categories[0].id : categories[1].id,
      storageLocationId: isOfficeSupply ? storageLocations[0].id : storageLocations[1].id,
      imageUrl: isOfficeSupply
        ? "/data/upload/pictures/seed-a4-copy-paper.jpg"
        : "/data/upload/pictures/seed-surface-cleaner.jpg",
      imageAlt: isOfficeSupply ? "Office supply product image" : "Cleaning supply product image",
    };
  });

  products.push(...additionalProducts);

  for (const product of products) {
    const { imageUrl, imageAlt, ...productData } = product;

    const saved = await prisma.product.upsert({
      where: { sku: product.sku },
      update: productData,
      create: productData,
    });

    const existingImage = await prisma.productImage.findFirst({
      where: { productId: saved.id, sortOrder: 0 },
      select: { id: true },
    });

    if (existingImage) {
      await prisma.productImage.update({
        where: { id: existingImage.id },
        data: {
          url: imageUrl,
          altText: imageAlt,
        },
      });
    } else {
      await prisma.productImage.create({
        data: {
          productId: saved.id,
          url: imageUrl,
          altText: imageAlt,
          sortOrder: 0,
        },
      });
    }
  }

  console.log(
    `Seed complete: ${products.length} products, 2 categories, 2 storage locations, 2 cost centers, 2 storage rooms.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
