/**
 * The production baseline probe.
 *
 * `DATABASE_URL` points at PRODUCTION and there is no staging, so every slice in this
 * project reads these counts after every task that writes the database. This script
 * exists because the five slices before it hand-wrote the probe each time, and
 * hand-writing it is what produced the incident `PROJECT_ROADMAP.md` records: the check
 * was **broken and read as clean, twice.**
 *
 * Three properties, each one earned by a specific past failure. Do not remove them.
 *
 * 1. **The body is wrapped in `async function main()`.** `npx tsx -e` with a top-level
 *    `await` printed NOTHING and exited 0 -- indistinguishable from a clean baseline --
 *    and as a bare file tsx compiles this directory as CJS, because no `package.json`
 *    above it declares `"type": "module"`.
 * 2. **`PrismaClient` gets a driver adapter.** Prisma 7 refuses to construct without
 *    one. This mirrors `src/prisma/prisma.service.ts:8` exactly; if that line ever
 *    changes, change this one with it.
 * 3. **It prints a terminal `RESULT` line and exits NON-ZERO on throw.** A silent
 *    failure must never be mistakable for a clean baseline. Read the `RESULT` line, not
 *    the exit code alone.
 *
 * `dotenv/config` is imported here rather than passed as `-r` on the command line, so
 * the script cannot be run a way that silently has no `DATABASE_URL`. It resolves `.env`
 * relative to the working directory, so **run this from `apps/api`**:
 *
 *     cd apps/api && npx tsx scripts/baseline.ts
 *
 * The expected baseline, as of Étape 5 piece 3: 3 users, 0 test users, 1 demande
 * (« Écran cassé », OPEN), 0 offers, 0 commandes, 11 VerificationAttempt (the owner's --
 * never delete these), 0 rows in all five Étape 5 tables. Migration count (20 as of this
 * piece) is checked separately via `ls prisma/migrations | wc -l`.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Run this from apps/api, where .env lives.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const [
      users,
      testUsers,
      demandes,
      offers,
      commandes,
      attempts,
      reviews,
      conversations,
      messages,
      reports,
      blocks,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { email: { endsWith: '@repareme.test' } } }),
      prisma.demande.count(),
      prisma.offer.count(),
      prisma.commande.count(),
      prisma.verificationAttempt.count(),
      prisma.review.count(),
      prisma.conversation.count(),
      prisma.message.count(),
      prisma.conversationReport.count(),
      prisma.block.count(),
    ]);

    // One line, every number, so a diff against the expected baseline is a single
    // string comparison rather than a reading exercise.
    console.log(
      `RESULT users=${users} test=${testUsers} demandes=${demandes} offers=${offers} ` +
        `commandes=${commandes} attempts=${attempts} reviews=${reviews} ` +
        `conversations=${conversations} messages=${messages} reports=${reports} ` +
        `blocks=${blocks}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
