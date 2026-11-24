// apps/api/scripts/seed-demo/index.mjs
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { assertApiFresh, assertDemoSeedAllowed, assertProjectRef, parseMode } from './guards.mjs';
import { runPhase1 } from './phase1-http.mjs';
import { applyPhase2, resolveCategoryId, restoreMutations } from './phase2-prisma.mjs';
import { planHistory } from './plan-history.mjs';
import { planThreads } from './plan-threads.mjs';
import { planBackdate } from './backdate.mjs';
import { CLIENTS, DEMO_DOMAIN, OPEN_DEMANDES, REPAIRERS } from './cast.mjs';
import { photoRowsFor, planPhotoPaths, resolvePhotoFile, uploadPhotos } from './photos.mjs';
import {
  applyDeletes,
  captureBackup,
  CLIENT_DEMANDE_ID,
  CLIENT_USER_ID,
  deleteStorageObjects,
  MUTATIONS,
  OWNER_USER_ID,
  TESTR_USER_ID,
  writeBackup,
} from './teardown.mjs';

const API = process.env.SEED_API_URL ?? 'http://localhost:3002';

function missingEnvVars(...names) {
  return names.filter((name) => !process.env[name]?.trim());
}

async function getCounts(prisma) {
  // `photos` is in here because a delta table that cannot show photos cannot show that
  // photos worked -- and the photo path is the one part of this seed that is skipped
  // silently when its three environment variables are absent.
  const [users, demandes, photos, offers, commandes, reviews, conversations, messages, notifications] =
    await Promise.all([
      prisma.user.count(),
      prisma.demande.count(),
      prisma.demandePhoto.count(),
      prisma.offer.count(),
      prisma.commande.count(),
      prisma.review.count(),
      prisma.conversation.count(),
      prisma.message.count(),
      prisma.notification.count(),
    ]);
  return { users, demandes, photos, offers, commandes, reviews, conversations, messages, notifications };
}

/**
 * Every seeded réparateur must have coordinates, and nothing else in this script would
 * notice if they did not.
 *
 * `geocode.service.ts` never throws and `users.service.ts:108` writes
 * `lat: result?.lat ?? null`, so a BAN lookup that fails -- eight of them go out
 * unthrottled -- silently leaves a profile with no geography. The cost is not cosmetic:
 * Karim's « Distance » and « Déplacement » wins are two of the four the comparison
 * screen is tuned around (design §5.3), and Comparaison's Distance column blanks for
 * every offer from a profile without coordinates. That is one of the seven criteria the
 * whole demo exists to show.
 */
async function assertRepairerCoordinates(prisma) {
  const missing = await prisma.repairerProfile.findMany({
    where: {
      user: { email: { endsWith: `@${DEMO_DOMAIN}` } },
      OR: [{ lat: null }, { lng: null }],
    },
    select: { displayName: true, postalCode: true, user: { select: { email: true } } },
  });

  if (missing.length > 0) {
    const named = missing
      .map((r) => `${r.displayName} (${r.user.email}, ${r.postalCode ?? 'no postal code'})`)
      .join('; ');
    throw new Error(
      `${missing.length} seeded réparateur profile(s) have no coordinates: ${named}. The BAN lookup failed silently for them -- geocode.service.ts never throws and users.service.ts writes lat/lng best-effort -- so Comparaison's Distance column would be blank for their offers. Re-run PATCH /users/me/repairer for those accounts, or --reset once the network is healthy.`,
    );
  }
}

async function assertClientUntouched(prisma) {
  const d = await prisma.demande.findUnique({ where: { id: CLIENT_DEMANDE_ID } });
  if (!d || d.status !== 'OPEN' || d.authorUserId !== CLIENT_USER_ID || d.deletedAt !== null) {
    throw new Error(
      "The client's own demande is not where it was. Refusing to report success -- investigate before doing anything else.",
    );
  }
}

async function main() {
  const { mode, dryRun } = parseMode(process.argv.slice(2));
  assertProjectRef(process.env.DATABASE_URL);
  assertDemoSeedAllowed(process.env, { mode, dryRun });

  // Skip API check for cleanup mode (no HTTP needed) or dry-run mode (no writes, just plan)
  if (mode !== 'cleanup' && !dryRun && missingEnvVars('SEED_DEMO_PASSWORD').length > 0) {
    throw new Error('SEED_DEMO_PASSWORD is not set: the seeded accounts need a password.');
  }
  if (mode !== 'cleanup' && !dryRun) await assertApiFresh(API);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const log = (msg) => console.log(`[seed-demo] ${msg}`);
  log(`mode=${mode} dryRun=${dryRun} api=${API}`);

  const before = await getCounts(prisma);
  log(`before: ${JSON.stringify(before)}`);

  if (dryRun) {
    // Pre-flight check in dry-run mode (Important 5)
    await assertClientUntouched(prisma);

    log('DRY RUN: printing plan with computed counts, no writes will be performed');

    if (mode === 'cleanup' || mode === 'reset') {
      log('\nCLEANUP PLAN:');
      log('- capture backup FIRST: doomed rows, cascade children, live mutation values,');
      log('  the ids of every surgical delete, and every storage path about to lose its row');
      log('- restore mutations to pre-existing rows');
      log('- apply hard deletes, by captured id for the three surgical steps');
      const storageMissing = missingEnvVars('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
      if (storageMissing.length === 0) {
        log('- delete storage objects from bucket');
      } else {
        log(`- storage cleanup: skipped (${storageMissing.join(', ')} not set)`);
      }
    }

    if (mode === 'seed' || mode === 'reset') {
      log('\nSEED PLAN:');
      log(`- create ${REPAIRERS.length} reparateurs + ${CLIENTS.length} clients via HTTP (phase 1)`);

      // Compute actual plans to show real counts (Important 4)
      const historyCategoryId = await resolveCategoryId(prisma, 'smartphone');
      const dryRepairerIds = Object.fromEntries([
        ...REPAIRERS.map((r) => [r.key, `dry-${r.key}`]),
        ['testr', TESTR_USER_ID],
        ['owner', OWNER_USER_ID],
      ]);
      const dryClientIds = Object.fromEntries(CLIENTS.map((c) => [c.key, `dry-${c.key}`]));
      const now = new Date();

      const dryHistory = planHistory({
        repairerIds: dryRepairerIds,
        clientIds: dryClientIds,
        categoryId: historyCategoryId,
        now,
      });
      const dryThreads = planThreads({
        clientUserId: CLIENT_USER_ID,
        clientDemandeId: CLIENT_DEMANDE_ID,
        repairerIds: { voltaire: dryRepairerIds.voltaire, karim: dryRepairerIds.karim },
        now,
      });
      const dryBackdate = planBackdate({ offerIds: ['a', 'b', 'c', 'd'], now });

      log(`- plan ${dryHistory.reviews.length} history reviews with substrate`);
      log(`- plan ${dryThreads.conversations.length} message threads on client demande`);
      log(`- backdate ${dryBackdate.length} offers on client demande`);
      const photoMissing = missingEnvVars('SEED_PHOTO_DIR', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
      if (photoMissing.length === 0) {
        log('- upload 12 demande photos and insert DemandePhoto rows');
      } else {
        log(`- photos: skipped (${photoMissing.join(', ')} not set)`);
      }
      log('- apply all plans through Prisma (phase 2)');
      log(`- mutate ${MUTATIONS.length} pre-existing rows`);
      log("- assert the client's rows are untouched and every seeded réparateur has coordinates");
    }

    log(`\nResolved category slug 'smartphone' to ${await resolveCategoryId(prisma, 'smartphone')}`);
    log('\nDRY RUN complete. No changes made.');
    await prisma.$disconnect();
    return;
  }

  // CLEANUP phase
  if (mode === 'cleanup' || mode === 'reset') {
    log('\n=== CLEANUP ===');
    // Pre-flight check (Important 5)
    await assertClientUntouched(prisma);

    // Capture backup BEFORE any mutations or deletes (Important 6, Critical 2)
    const backupPath = `./demo-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const backup = await captureBackup(prisma, { log });
    writeBackup(backup, backupPath);
    log(`backup written to ${backupPath}`);

    // Restore mutations (changes live values back to static restore values)
    await restoreMutations(prisma, { mutations: MUTATIONS, log });

    // Apply deletes. The three surgical steps run by the ids the backup captured, so
    // nothing below re-queries rows it has already deleted.
    await applyDeletes(prisma, { backup, log });

    // Delete storage objects if configured. Consumes the captured paths rather than
    // querying DemandePhoto, which by this line has none of them left.
    const storageMissing = missingEnvVars('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
    if (storageMissing.length === 0) {
      await deleteStorageObjects(backup, {
        supabaseUrl: process.env.SUPABASE_URL,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        log,
      });
    } else {
      log(`storage cleanup: skipped (${storageMissing.join(', ')} not set)`);
    }

    // Post-check
    await assertClientUntouched(prisma);
    log('cleanup complete, client untouched');
  }

  // SEED phase
  if (mode === 'seed' || mode === 'reset') {
    log('\n=== SEED ===');

    // Pre-check: refuse --seed if demo accounts already exist (Phase 1 is outside the
    // transaction, so a Phase 2 rollback would leave duplicates). --reset is unaffected
    // because it tears down first.
    if (mode === 'seed') {
      const demoUserCount = await prisma.user.count({ where: { email: { endsWith: '@demo.revime.fr' } } });
      if (demoUserCount > 0) {
        throw new Error(
          `Found ${demoUserCount} existing @demo.revime.fr users. Phase 1 (HTTP account creation) sits outside the transaction, so a Phase 2 rollback would leave duplicates. Use --reset instead, which tears down first.`,
        );
      }
    }

    // Phase 1: create accounts via HTTP
    const resolver = (slug) => resolveCategoryId(prisma, slug);
    const phase1Result = await runPhase1({
      baseUrl: API,
      resolveCategoryId: resolver,
      clientDemandeId: CLIENT_DEMANDE_ID,
      log,
    });

    // Merge pre-existing réparateur IDs (decision 4: planHistory needs testr and owner)
    const repairerIds = {
      ...phase1Result.repairerIds,
      testr: TESTR_USER_ID,
      owner: OWNER_USER_ID,
    };

    const now = new Date();

    // Plan history: 36 reviews with substrate
    const historyCategoryId = await resolveCategoryId(prisma, 'smartphone');
    const history = planHistory({
      repairerIds,
      clientIds: phase1Result.clientIds,
      categoryId: historyCategoryId,
      now,
    });
    log(`planned ${history.reviews.length} reviews with substrate`);

    // Plan threads: 2 conversations on client demande
    const threads = planThreads({
      clientUserId: CLIENT_USER_ID,
      clientDemandeId: CLIENT_DEMANDE_ID,
      repairerIds: { voltaire: repairerIds.voltaire, karim: repairerIds.karim },
      now,
    });
    log(`planned ${threads.conversations.length} threads`);

    // Plan backdate: spread the 4 tuned offers over the last 2 days
    const backdate = planBackdate({ offerIds: phase1Result.tunedOfferIds, now });
    log(`planned ${backdate.length} backdates`);

    // Photos: upload and plan DemandePhoto rows
    let photoRows;
    const photoMissing = missingEnvVars('SEED_PHOTO_DIR', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
    if (photoMissing.length === 0) {
      const folder = process.env.SEED_PHOTO_DIR;

      /**
       * 🛑 The pairing below is POSITIONAL and cannot be anything else. `runPhase1`
       * pushes one id per demande in `OPEN_DEMANDES` order, so `OPEN_DEMANDES[i]`
       * belongs to `openDemandeIds[i]`. Keying by `clientKey` -- which an earlier
       * version of this block did -- cannot even represent the data: 11 demandes
       * share 6 clients, so two demandes by the same client collide and one silently
       * takes the other's photo.
       *
       * The length check is not defensive noise. Phase 1 has already written 14
       * accounts, 11 demandes and 4 offers to production by this line, so a mismatch
       * discovered later is discovered mid-write.
       */
      if (phase1Result.openDemandeIds.length !== OPEN_DEMANDES.length) {
        throw new Error(
          `Phase 1 returned ${phase1Result.openDemandeIds.length} demande ids for ${OPEN_DEMANDES.length} planned OPEN demandes. The photo pairing is positional, so it would attach photos to the wrong demandes. Refusing to continue -- Phase 1 has already written, so investigate before re-running.`,
        );
      }

      const demandesWithPhotos = [
        ...OPEN_DEMANDES.map((d, i) => ({
          ...d,
          id: phase1Result.openDemandeIds[i],
          authorUserId: phase1Result.clientIds[d.clientKey],
        })),
        {
          id: CLIENT_DEMANDE_ID,
          categorySlug: 'ecran-casse',
          authorUserId: CLIENT_USER_ID,
        },
      ];

      const resolved = demandesWithPhotos.map((d) => {
        const { file, ext, pathExt, contentType } = resolvePhotoFile(folder, d.categorySlug);
        return { ...d, file, ext, pathExt, contentType };
      });

      const photoPlans = planPhotoPaths({ demandes: resolved });
      await uploadPhotos(photoPlans, {
        supabaseUrl: process.env.SUPABASE_URL,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        folder,
        log,
      });
      // Prisma gets the row half only. See planPhotoPaths on why the two are separate.
      photoRows = photoRowsFor(photoPlans);
      log(`uploaded ${photoRows.length} photos`);
    } else {
      log(`photos: skipped (${photoMissing.join(', ')} not set)`);
    }

    // Phase 2: apply all plans through Prisma
    await applyPhase2(prisma, {
      history,
      threads,
      backdate,
      mutations: MUTATIONS,
      photos: photoRows,
      log,
    });

    await assertClientUntouched(prisma);
    await assertRepairerCoordinates(prisma);
    log('seed complete, client untouched, every seeded réparateur geocoded');
  }

  const after = await getCounts(prisma);
  log(`after: ${JSON.stringify(after)}`);

  // Print delta table
  log('\n=== DELTA ===');
  for (const key of Object.keys(before)) {
    const delta = after[key] - before[key];
    if (delta !== 0) {
      log(`${key}: ${before[key]} → ${after[key]} (${delta > 0 ? '+' : ''}${delta})`);
    }
  }

  await prisma.$disconnect();
  log('\n✓ done');
}

main().catch((e) => {
  console.error('[seed-demo] refused or failed:', e.message);
  process.exit(1);
});
