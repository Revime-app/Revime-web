-- RU-25 / F7: persist the admin alert channel preferences. Additive and nullable: a NULL row means
-- « every channel on », which is what the application defaults to, so no backfill is needed.
ALTER TABLE "PlatformSettings" ADD COLUMN "alertPreferences" JSONB;
