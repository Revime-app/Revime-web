-- `CF-25`. A réparateur's declared speciality set. Purely additive: no existing table is
-- touched and NO BACKFILL is possible or wanted. Nobody has declared anything, and inferring a
-- declaration from offer history would manufacture the very claim the fiche keeps separate from
-- the derived « Catégories traitées ».
--
-- Keyed on "User" rather than "RepairerProfile" because a RepairerProfile is soft-deleted on
-- mode disable and restored on re-enable; a declaration must survive that. See the model's own
-- doc comment in schema.prisma.

-- CreateTable
CREATE TABLE "RepairerCategory" (
    "id" TEXT NOT NULL,
    "repairerUserId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairerCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RepairerCategory_repairerUserId_categoryId_key"
  ON "RepairerCategory"("repairerUserId", "categoryId");

-- CreateIndex
CREATE INDEX "RepairerCategory_repairerUserId_idx" ON "RepairerCategory"("repairerUserId");

-- CreateIndex
CREATE INDEX "RepairerCategory_categoryId_idx" ON "RepairerCategory"("categoryId");

-- AddForeignKey
ALTER TABLE "RepairerCategory" ADD CONSTRAINT "RepairerCategory_repairerUserId_fkey"
  FOREIGN KEY ("repairerUserId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey. RESTRICT, not CASCADE: a declared category must not become deletable.
ALTER TABLE "RepairerCategory" ADD CONSTRAINT "RepairerCategory_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS on with no policies, matching migration 27's two tables. Every read and write goes
-- through the API's service role; a direct client has no path in.
ALTER TABLE "RepairerCategory" ENABLE ROW LEVEL SECURITY;
