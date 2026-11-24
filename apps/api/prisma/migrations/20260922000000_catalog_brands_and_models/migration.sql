-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandCategory" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceModel" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "categoryId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceModel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_slug_key" ON "Brand"("slug");

-- CreateIndex
CREATE INDEX "Brand_active_sortOrder_idx" ON "Brand"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "BrandCategory_categoryId_idx" ON "BrandCategory"("categoryId");

-- CreateIndex
CREATE INDEX "BrandCategory_brandId_idx" ON "BrandCategory"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandCategory_brandId_categoryId_key" ON "BrandCategory"("brandId", "categoryId");

-- CreateIndex
CREATE INDEX "DeviceModel_brandId_active_sortOrder_idx" ON "DeviceModel"("brandId", "active", "sortOrder");

-- CreateIndex
CREATE INDEX "DeviceModel_categoryId_idx" ON "DeviceModel"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceModel_brandId_slug_key" ON "DeviceModel"("brandId", "slug");

-- AddForeignKey
ALTER TABLE "BrandCategory" ADD CONSTRAINT "BrandCategory_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandCategory" ADD CONSTRAINT "BrandCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceModel" ADD CONSTRAINT "DeviceModel_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceModel" ADD CONSTRAINT "DeviceModel_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS backstop: API access uses service role
ALTER TABLE "Brand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BrandCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeviceModel" ENABLE ROW LEVEL SECURITY;

-- Baseline seeds for standard brands
INSERT INTO "Brand" ("id", "slug", "name", "sortOrder", "active", "createdAt", "updatedAt") VALUES
  (gen_random_uuid(), 'apple', 'Apple', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'samsung', 'Samsung', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'sony', 'Sony', 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'xiaomi', 'Xiaomi', 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'huawei', 'Huawei', 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'google', 'Google', 6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'asus', 'Asus', 7, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'lenovo', 'Lenovo', 8, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'hp', 'HP', 9, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'dell', 'Dell', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'nintendo', 'Nintendo', 11, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'microsoft', 'Microsoft', 12, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'dyson', 'Dyson', 13, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'bosch', 'Bosch', 14, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'philips', 'Philips', 15, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Baseline models for standard brands
INSERT INTO "DeviceModel" ("id", "brandId", "name", "slug", "sortOrder", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid(), b."id", m."name", m."slug", m."sortOrder", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Brand" b
JOIN (
  VALUES
    ('apple', 'iPhone 13', 'iphone-13', 1),
    ('apple', 'iPhone 14', 'iphone-14', 2),
    ('apple', 'iPhone 15', 'iphone-15', 3),
    ('apple', 'MacBook Pro', 'macbook-pro', 4),
    ('apple', 'iPad Pro', 'ipad-pro', 5),
    ('samsung', 'Galaxy S22', 'galaxy-s22', 1),
    ('samsung', 'Galaxy S23', 'galaxy-s23', 2),
    ('samsung', 'Galaxy S24', 'galaxy-s24', 3),
    ('sony', 'PlayStation 5', 'playstation-5', 1),
    ('nintendo', 'Switch', 'switch', 1),
    ('dyson', 'V11', 'v11', 1),
    ('dyson', 'V15', 'v15', 2)
) AS m("brandSlug", "name", "slug", "sortOrder") ON b."slug" = m."brandSlug";
