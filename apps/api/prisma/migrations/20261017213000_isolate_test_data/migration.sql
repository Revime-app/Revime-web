-- PRE-3: Isolate test data and clean test artifacts

-- 1. Delete test requests linked to category 'chocolat'
DELETE FROM "Demande"
WHERE "categoryId" IN (SELECT "id" FROM "Category" WHERE "slug" = 'chocolat');

-- 2. Delete test categories from catalog
DELETE FROM "Category"
WHERE "slug" IN ('test', 'chocolat', 'tmp-parent-off', 'tmp-child-on');

-- 3. Soft-hide the 'Iphone 25' test demande
UPDATE "Demande"
SET "hiddenAt" = NOW(),
    "hiddenReason" = 'Demande de test (Iphone 25) masquée avant ouverture au public'
WHERE (LOWER("model") LIKE '%iphone 25%' OR LOWER("title") LIKE '%iphone 25%')
  AND "hiddenAt" IS NULL;
