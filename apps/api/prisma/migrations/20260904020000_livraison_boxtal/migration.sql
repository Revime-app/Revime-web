-- Livraison Boxtal. Spec: docs/superpowers/specs/2026-09-04-livraison-boxtal-design.md §4.1.
--
-- Purely additive: three enums, six NotificationType values, eight nullable-or-defaulted
-- Commande columns, four nullable ShippingAddress columns, four new tables. NO BACKFILL: every
-- new column is null or defaulted for every existing row, and no existing value is rewritten.
--
-- ALTER TYPE ... ADD VALUE may not have its new value USED in the same transaction, and
-- Prisma runs this file in one. Nothing here uses the new values, so the constraint is met.
--
-- Numbered AFTER 20260904000000_demande_moderation (Stage 6 C1), which must be applied first.

-- CreateEnum
CREATE TYPE "ParcelOption" AS ENUM ('RELAY', 'HOME');
CREATE TYPE "ShipmentLeg" AS ENUM ('OUTBOUND', 'RETURN');
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'ORDERED', 'LABEL_READY', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'FAILED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PARCEL_LABEL_READY';
ALTER TYPE "NotificationType" ADD VALUE 'PARCEL_SHIPPED';
ALTER TYPE "NotificationType" ADD VALUE 'PARCEL_OUT_FOR_DELIVERY';
ALTER TYPE "NotificationType" ADD VALUE 'PARCEL_AT_PICKUP_POINT';
ALTER TYPE "NotificationType" ADD VALUE 'PARCEL_DELIVERED';
ALTER TYPE "NotificationType" ADD VALUE 'PARCEL_INCIDENT';

-- AlterTable
ALTER TABLE "Commande"
  ADD COLUMN "parcelOption"      "ParcelOption",
  ADD COLUMN "parcelWeightGrams" INTEGER,
  ADD COLUMN "parcelLengthCm"    INTEGER,
  ADD COLUMN "parcelWidthCm"     INTEGER,
  ADD COLUMN "parcelHeightCm"    INTEGER,
  ADD COLUMN "parcelValueCents"  INTEGER,
  ADD COLUMN "insuranceCents"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "shippingQuoteId"   TEXT;

CREATE UNIQUE INDEX "Commande_shippingQuoteId_key" ON "Commande"("shippingQuoteId");

-- AlterTable
ALTER TABLE "ShippingAddress"
  ADD COLUMN "parcelPointCode"    TEXT,
  ADD COLUMN "parcelPointNetwork" TEXT,
  ADD COLUMN "parcelPointName"    TEXT,
  ADD COLUMN "parcelPointAddress" TEXT;

-- CreateTable
CREATE TABLE "ShippingQuote" (
  "id"                  TEXT NOT NULL,
  "offerId"             TEXT NOT NULL,
  "clientUserId"        TEXT NOT NULL,
  "parcelWeightGrams"   INTEGER NOT NULL,
  "parcelLengthCm"      INTEGER NOT NULL,
  "parcelWidthCm"       INTEGER NOT NULL,
  "parcelHeightCm"      INTEGER NOT NULL,
  "parcelValueCents"    INTEGER NOT NULL,
  "relayShippingCents"        INTEGER,
  "relayInsuredShippingCents" INTEGER,
  "relayInsuranceCents"       INTEGER,
  "homeShippingCents"         INTEGER,
  "homeInsuredShippingCents"  INTEGER,
  "homeInsuranceCents"        INTEGER,
  "legs"                JSONB NOT NULL,
  "expiresAt"           TIMESTAMP(3) NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShippingQuote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShippingQuote_offerId_clientUserId_createdAt_idx" ON "ShippingQuote"("offerId", "clientUserId", "createdAt");
ALTER TABLE "ShippingQuote" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "Shipment" (
  "id"                     TEXT NOT NULL,
  "commandeId"             TEXT NOT NULL,
  "leg"                    "ShipmentLeg" NOT NULL,
  "status"                 "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
  "carrierCode"            TEXT NOT NULL,
  "serviceCode"            TEXT NOT NULL,
  "carrierLabel"           TEXT NOT NULL,
  "quotedCostExclTaxCents" INTEGER NOT NULL,
  "quotedCostInclTaxCents" INTEGER NOT NULL,
  "insured"                BOOLEAN NOT NULL DEFAULT false,
  "quotedInsuranceCents"   INTEGER NOT NULL DEFAULT 0,
  "boxtalOrderId"          TEXT,
  "boxtalStatus"           TEXT,
  "billedExclTaxCents"     INTEGER,
  "labelStoragePath"       TEXT,
  "labelIssuedAt"          TIMESTAMP(3),
  "orderedAt"              TIMESTAMP(3),
  "firstScanAt"            TIMESTAMP(3),
  "deliveredAt"            TIMESTAMP(3),
  "cancelledAt"            TIMESTAMP(3),
  "failureReason"          TEXT,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Shipment_boxtalOrderId_key" ON "Shipment"("boxtalOrderId");
CREATE UNIQUE INDEX "Shipment_commandeId_leg_key" ON "Shipment"("commandeId", "leg");
ALTER TABLE "Shipment" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "ShipmentEvent" (
  "id"         TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "status"     TEXT NOT NULL,
  "message"    TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "raw"        JSONB NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShipmentEvent_shipmentId_status_occurredAt_key" ON "ShipmentEvent"("shipmentId", "status", "occurredAt");
CREATE INDEX "ShipmentEvent_shipmentId_occurredAt_idx" ON "ShipmentEvent"("shipmentId", "occurredAt");
ALTER TABLE "ShipmentEvent" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "BoxtalEvent" (
  "id"         TEXT NOT NULL,
  "type"       TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BoxtalEvent_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "BoxtalEvent" ENABLE ROW LEVEL SECURITY;

-- AddForeignKey
ALTER TABLE "Commande" ADD CONSTRAINT "Commande_shippingQuoteId_fkey"
  FOREIGN KEY ("shippingQuoteId") REFERENCES "ShippingQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_commandeId_fkey"
  FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey"
  FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
