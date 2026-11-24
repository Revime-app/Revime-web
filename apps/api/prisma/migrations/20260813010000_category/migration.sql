-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "labelFr" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_active_sortOrder_idx" ON "Category"("active", "sortOrder");

-- Deny-all RLS backstop, per 20260728022124_enable_rls_identity.
ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;

-- Provisional launch taxonomy. Seeded in the migration rather than a seed script
-- so it deploys automatically with `migrate deploy` and cannot be forgotten.
-- The client's real list (livrable §6.1 answer 1) replaces this as a later data
-- migration; nothing in the code depends on these particular rows.
INSERT INTO "Category" ("id", "slug", "labelFr", "sortOrder", "active") VALUES
  (gen_random_uuid(), 'smartphone',       'Smartphone',       1, true),
  (gen_random_uuid(), 'ordinateur',       'Ordinateur',       2, true),
  (gen_random_uuid(), 'tablette',         'Tablette',         3, true),
  (gen_random_uuid(), 'console',          'Console',          4, true),
  (gen_random_uuid(), 'ecran',            'Écran',            5, true),
  (gen_random_uuid(), 'batterie',         'Batterie',         6, true),
  (gen_random_uuid(), 'electromenager',   'Électroménager',   7, true),
  (gen_random_uuid(), 'montre-connectee', 'Montre connectée', 8, true);
