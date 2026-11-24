/**
 * CF4-41, spec §4.3. Recovery when the LAST Super Admin has lost their authenticator and
 * backup codes, so nobody can reset them from the dashboard.
 *
 *   npx tsx scripts/reset-admin-2fa.ts <email>
 *
 * 🛑 WRITES PRODUCTION (apps/api/.env). Run only with the owner's explicit approval. It deletes
 * the account's second factor and every session; the next password sign-in lands on /securite.
 */
import { pathToFileURL } from 'node:url';
import { clearTwoFactor } from '../src/admin/admin-staff.service.js';

type ScriptPrisma = {
  $transaction<T>(fn: (tx: never) => Promise<T>): Promise<T>;
};

export async function resetTwoFactorForEmail(prisma: ScriptPrisma, email: string): Promise<void> {
  await prisma.$transaction(async (tx: never) => {
    const t = tx as unknown as {
      user: { findFirst(args: unknown): Promise<{ id: string } | null> };
    } & Parameters<typeof clearTwoFactor>[0];
    const user = await t.user.findFirst({ where: { email }, select: { id: true } });
    if (!user) throw new Error(`Aucun compte pour ${email}.`);
    await clearTwoFactor(t, user.id);
  });
}

async function main(): Promise<void> {
  const email = process.argv[2]?.trim();
  if (!email) {
    console.error('Usage: npx tsx scripts/reset-admin-2fa.ts <email>');
    process.exit(1);
  }
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const { PrismaClient } = await import('../src/generated/prisma/client.js');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    await resetTwoFactorForEmail(prisma as unknown as ScriptPrisma, email);
    console.log(`Double authentification réinitialisée pour ${email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

// Only when executed directly - importing this module (its unit test) must never touch a database.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
