// apps/api/scripts/ad-sim-cleanup/index.mjs
//
// CF2-28 removal: undo what the ad filming simulation left in production. See plan.mjs.
//
//   npx tsx scripts/ad-sim-cleanup/index.mjs --dry-run   # read-only, prints the plan
//   npx tsx scripts/ad-sim-cleanup/index.mjs --apply     # writes a backup JSON, then one transaction
//
// `tsx`, not `node`: the generated Prisma client is TypeScript, same as seed-demo.
// Run from apps/api with DATABASE_URL in .env. Refuses to run against any other project.
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { assertProjectRef } from '../seed-demo/guards.mjs';
import { REPAIRERS } from '../seed-demo/cast.mjs';
import { notificationWhere, offerWhere, profileRestores } from './plan.mjs';

const BAN_ENDPOINT = 'https://api-adresse.data.gouv.fr/search/';

/** Same query as `geocode.service.ts`. Throws instead of returning null: a miss must abort, not write null coordinates. */
async function geocode(postalCode) {
  const url = `${BAN_ENDPOINT}?q=${postalCode}&postcode=${postalCode}&type=municipality&limit=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`BAN returned ${res.status} for ${postalCode}`);
  const body = await res.json();
  const coords = body.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coords) || typeof coords[0] !== 'number' || typeof coords[1] !== 'number') {
    throw new Error(`BAN has no coordinates for ${postalCode}`);
  }
  const [lng, lat] = coords;
  return { lat, lng };
}

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  const apply = argv.includes('--apply');
  if (dryRun === apply) throw new Error('Pass exactly one of --dry-run or --apply.');
  return { apply };
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  assertProjectRef(process.env.DATABASE_URL);
  const log = (msg) => console.log(`[ad-sim-cleanup] ${msg}`);
  log(`mode=${apply ? 'APPLY' : 'DRY RUN'}`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    // 1. The eight réparateurs. All must exist: a missing one means this is not the database we think.
    const users = await prisma.user.findMany({
      where: { email: { in: REPAIRERS.map((r) => r.email) } },
      select: { id: true, email: true, repairerProfile: true },
    });
    const byEmail = new Map(users.map((u) => [u.email, u]));
    const missing = REPAIRERS.filter((r) => !byEmail.has(r.email)).map((r) => r.email);
    if (missing.length > 0) throw new Error(`Seed réparateurs not found: ${missing.join(', ')}. Refusing to run.`);
    const idsByKey = Object.fromEntries(REPAIRERS.map((r) => [r.key, byEmail.get(r.email).id]));

    // 2. Profile restores, geocoded up front so a BAN failure aborts before anything is written.
    const restores = [];
    for (const r of profileRestores()) {
      const user = byEmail.get(r.email);
      const { lat, lng } = await geocode(r.postalCode);
      restores.push({ userId: user.id, email: r.email, before: user.repairerProfile, after: { displayName: r.displayName, postalCode: r.postalCode, lat, lng } });
    }

    // 3. Simulated offers and notifications, captured by id. Deletes go by these ids only.
    const where = offerWhere(idsByKey);
    const offers = await prisma.offer.findMany({ where });
    const { commandes: _guard, ...unguarded } = where;
    const skipped = await prisma.offer.findMany({ where: { ...unguarded, commandes: { some: {} } }, select: { id: true, demandeId: true } });
    const notifications = await prisma.notification.findMany({ where: notificationWhere() });

    // 4. The plan.
    log('profiles to restore:');
    for (const r of restores) {
      const b = r.before;
      log(`  ${r.email}: "${b?.displayName}" ${b?.postalCode} (${b?.lat}, ${b?.lng}) -> "${r.after.displayName}" ${r.after.postalCode} (${r.after.lat}, ${r.after.lng})`);
    }
    const offerDemandes = [...new Set(offers.map((o) => o.demandeId))];
    log(`simulated offers to delete: ${offers.length} across ${offerDemandes.length} demande(s): ${offerDemandes.join(', ') || '-'}`);
    if (skipped.length > 0) log(`⚠️  ${skipped.length} simulated offer(s) KEPT because a commande references them: ${skipped.map((o) => o.id).join(', ')}`);
    const notifUsers = [...new Set(notifications.map((n) => n.userId))];
    log(`simulated OFFER_RECEIVED notifications to delete: ${notifications.length} for ${notifUsers.length} user(s)`);

    if (!apply) {
      log('DRY RUN: nothing written.');
      return;
    }

    // 5. Backup, then one transaction.
    const backupPath = `./ad-sim-cleanup-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    writeFileSync(backupPath, JSON.stringify({ takenAt: new Date().toISOString(), restores, offers, notifications }, null, 2));
    log(`backup written to ${backupPath}`);

    await prisma.$transaction(async (tx) => {
      for (const r of restores) {
        await tx.repairerProfile.update({ where: { userId: r.userId }, data: r.after });
      }
      const o = await tx.offer.deleteMany({ where: { id: { in: offers.map((x) => x.id) } } });
      const n = await tx.notification.deleteMany({ where: { id: { in: notifications.map((x) => x.id) } } });
      log(`restored ${restores.length} profile(s), deleted ${o.count} offer(s) and ${n.count} notification(s)`);
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[ad-sim-cleanup] FAILED:', error.message ?? error);
  process.exit(1);
});
