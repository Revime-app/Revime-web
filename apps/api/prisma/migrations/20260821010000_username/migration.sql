-- CF-04 and CF-05. The 22nd migration.
--
-- Four steps, and step 4 is the one that closes the leak: RepairerProfile.displayName
-- has always been seeded from user.name (users.service.ts:80), and displayName is the
-- PUBLIC repairer identity on nine surfaces. Measured 2026-08-21: all 3 real repairer
-- profiles in production had displayName exactly equal to the account name, so the
-- default had never once been overridden by a real user.

-- 1. Nullable first, so the backfill has somewhere to write.
ALTER TABLE "user" ADD COLUMN "username" TEXT;

-- 2. Backfill. The regexp chain mirrors deriveUsername in
--    packages/shared/src/username.schemas.ts. It is a SECOND implementation of that
--    one rule, which is a real divergence risk, accepted because this runs ONCE over a
--    row set enumerated before and asserted after -- doing it in TS would need two
--    migrations with a script between them for 18 rows. It is still written to be
--    correct in general, because a fresh environment runs it too.
WITH b AS (
  SELECT id, "createdAt",
         btrim(regexp_replace(regexp_replace(lower(split_part(email, '@', 1)),
                '[^a-z0-9_]', '_', 'g'), '_{2,}', '_', 'g'), '_') AS raw
  FROM "user"
), c AS (
  -- The letter guarantee runs BEFORE truncation, exactly as deriveUsername does, or an
  -- all-digit local part longer than 20 chars survives it with no letter.
  SELECT id, "createdAt",
         CASE WHEN raw ~ '[a-z]' THEN raw ELSE 'user' || raw END AS lettered
  FROM b
), d AS (
  -- 🛑 rpad TRUNCATES as well as pads in PostgreSQL: rpad('atelier_voltaire',3,'0') = 'ate'.
  -- JS padEnd only extends, so an unconditional rpad here diverged from deriveUsername on
  -- every local part longer than 3 chars. Pad ONLY when the candidate is genuinely short.
  SELECT id, "createdAt",
         CASE WHEN length(btrim(left(lettered, 20), '_')) < 3
              THEN rpad(btrim(left(lettered, 20), '_'), 3, '0')
              ELSE btrim(left(lettered, 20), '_') END AS cand
  FROM c
), r AS (
  -- Reserved words are escaped BEFORE the dedupe, so 'support' becomes 'support1' and a
  -- second support@ address then becomes 'support12' via rn below rather than colliding.
  -- This list must stay equal to RESERVED_USERNAMES in packages/shared.
  SELECT id, "createdAt",
         CASE WHEN cand IN ('revime','admin','administrateur','support','aide','contact',
                            'equipe','moderateur','moderation','officiel','api','me',
                            'root','system','null','undefined')
              THEN left(cand, 19) || '1' ELSE cand END AS cand
  FROM d
), e AS (
  -- Deterministic tie-break: the OLDEST account keeps the unsuffixed handle.
  SELECT id, cand,
         row_number() OVER (PARTITION BY cand ORDER BY "createdAt", id) AS rn
  FROM r
)
UPDATE "user" u SET "username" =
  CASE WHEN e.rn = 1 THEN e.cand
       ELSE left(e.cand, 20 - length(e.rn::text)) || e.rn::text END
FROM e WHERE e.id = u.id;

-- 3. Lock it down.
ALTER TABLE "user" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- 4. Close the CF-05 leak on rows that never overrode the default. The predicate is
--    equality with the account name, so a repairer who DID choose a trade name keeps it.
UPDATE "RepairerProfile" rp SET "displayName" = '@' || u."username"
FROM "user" u WHERE u.id = rp."userId" AND rp."displayName" = u.name;

-- 5. CF-05 on SNAPSHOTTED names. actorName is a pre-CF-05 snapshot of user.name, and
--    notificationCopy interpolates it into the visible line, so it is as public as a name
--    on a screen. Measured 2026-08-22: 22 rows.
--
--    NULL rather than '@' || u.username deliberately: the only available join is
--    name-equality, which is not a reliable identity — two users can share a name, so
--    writing a handle risks attributing a notification to the WRONG person, which is worse
--    than losing the attribution. `named()` in notification.schemas.ts supplies a role
--    fallback on every branch, so NULL degrades to « Un réparateur » / « Le client » /
--    « votre correspondant » rather than breaking the copy.
UPDATE "Notification" n SET "actorName" = NULL
WHERE n."actorName" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "user" u WHERE u.name = n."actorName");
