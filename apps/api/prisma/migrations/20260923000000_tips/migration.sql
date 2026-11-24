-- CreateEnum
CREATE TYPE "TipCategory" AS ENUM ('CLIENT', 'REPAIRER', 'ALL');

-- CreateTable
CREATE TABLE "Tip" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "category" "TipCategory" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tip_category_active_idx" ON "Tip"("category", "active");

-- RLS backstop: API access uses service role
ALTER TABLE "Tip" ENABLE ROW LEVEL SECURITY;
