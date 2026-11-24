-- CreateTable
CREATE TABLE "CommandeStepEvent" (
    "id" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "step" "CommandeStep" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommandeStepEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommandeStepEvent_commandeId_at_idx" ON "CommandeStepEvent"("commandeId", "at");

-- AddForeignKey
ALTER TABLE "CommandeStepEvent" ADD CONSTRAINT "CommandeStepEvent_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS backstop: API access uses service role
ALTER TABLE "CommandeStepEvent" ENABLE ROW LEVEL SECURITY;
