-- CF4-F (spec §3, F3). The first in-app download of a stored label, stamped by the
-- leg's sender. No backfill: downloads before this deploy were never recorded, so
-- those labels render "Étiquette créée" until downloaded again.
ALTER TABLE "Shipment" ADD COLUMN "labelDownloadedAt" TIMESTAMP(3);
