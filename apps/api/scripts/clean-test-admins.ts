/**
 * PRE-1 Maintenance Utility: Clean Test Admin Accounts & Audit Mandatory 2FA.
 *
 * Demotes all test accounts (@repareme.test) holding administrative staff roles
 * to role = null and invalidates their active sessions.
 * Verifies that the minimum invariant of >= 2 active Super Admins is preserved,
 * and audits 2FA compliance across all remaining staff members.
 *
 * Usage:
 *   npx tsx scripts/clean-test-admins.ts
 *   npm run clean:test-admins -w @revime/api
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { ADMIN_ROLES } from '@revime/shared';
import { TEST_FIXTURE_EMAIL_SUFFIX } from '../src/admin/admin-constants.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

export interface CleanAdminsReport {
  beforeCount: number;
  demotedCount: number;
  sessionsDeleted: number;
  remainingStaff: Array<{ id: string; email: string; role: string | null; twoFactorEnabled: boolean }>;
  superAdminCount: number;
  missing2faCount: number;
}

type StaffRow = { id: string; email: string; role: string | null; twoFactorEnabled: boolean | null };

const isTestAccount = (email: string): boolean => email.toLowerCase().endsWith(TEST_FIXTURE_EMAIL_SUFFIX);

export async function cleanTestStaffAccounts(
  prisma: Pick<PrismaClient, 'user' | 'session' | '$transaction'>,
): Promise<CleanAdminsReport> {
  const staffSelect = { id: true, email: true, role: true, twoFactorEnabled: true } as const;
  const staffBefore: StaffRow[] = await prisma.user.findMany({
    where: { role: { in: [...ADMIN_ROLES] } },
    select: staffSelect,
  });

  const testStaff = staffBefore.filter((u) => isTestAccount(u.email));
  const testStaffIds = testStaff.map((u) => u.id);

  // The >= 2 Super Admins rule is checked BEFORE anything is written: it used to run after the
  // demotion, with no transaction, so the throw arrived once the accounts were already demoted.
  const keptSuperAdmins = staffBefore.filter((u) => u.role === 'super_admin' && !isTestAccount(u.email));
  if (testStaffIds.length > 0 && keptSuperAdmins.length < 2) {
    throw new Error(
      `Safety violation: only ${keptSuperAdmins.length} real Super Admin(s) would remain, the required minimum is 2. Nothing was changed.`,
    );
  }

  let sessionsDeleted = 0;
  if (testStaffIds.length > 0) {
    // One transaction: the sessions go with the roles or not at all.
    const [sessionRes] = await prisma.$transaction([
      prisma.session.deleteMany({ where: { userId: { in: testStaffIds } } }),
      prisma.user.updateMany({ where: { id: { in: testStaffIds } }, data: { role: null } }),
    ]);
    sessionsDeleted = sessionRes.count;
  }

  const staffAfter: StaffRow[] = await prisma.user.findMany({
    where: { role: { in: [...ADMIN_ROLES] } },
    select: staffSelect,
  });
  if (staffAfter.some((u) => isTestAccount(u.email))) {
    throw new Error('Safety assertion failed: a test account still holds a staff role after the demotion.');
  }

  const missing2fa = staffAfter.filter((u) => !u.twoFactorEnabled);

  return {
    beforeCount: staffBefore.length,
    demotedCount: testStaff.length,
    sessionsDeleted,
    remainingStaff: staffAfter.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      twoFactorEnabled: Boolean(u.twoFactorEnabled),
    })),
    superAdminCount: staffAfter.filter((u) => u.role === 'super_admin').length,
    missing2faCount: missing2fa.length,
  };
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Run this from apps/api where .env lives.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    console.log('[PRE-1] Auditing and cleaning test admin accounts...');
    const report = await cleanTestStaffAccounts(prisma);
    console.log(`[PRE-1] Initial staff count: ${report.beforeCount}`);
    console.log(`[PRE-1] Demoted test accounts: ${report.demotedCount}`);
    console.log(`[PRE-1] Purged sessions: ${report.sessionsDeleted}`);
    console.log(`[PRE-1] Remaining staff members: ${report.remainingStaff.length} (Super Admins: ${report.superAdminCount})`);
    for (const member of report.remainingStaff) {
      console.log(`  - ${member.email} [${member.role}] 2FA: ${member.twoFactorEnabled ? 'OK' : 'MISSING'}`);
    }
    if (report.missing2faCount > 0) {
      console.warn(`[PRE-1] WARNING: ${report.missing2faCount} staff member(s) lack 2FA!`);
    } else {
      console.log('[PRE-1] All remaining staff members have 2FA enabled.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectCliRun =
  !process.env.VITEST &&
  Boolean(
    process.argv[1] &&
      (process.argv[1].endsWith('clean-test-admins.ts') ||
        process.argv[1].endsWith('clean-test-admins.js') ||
        (typeof import.meta.url === 'string' &&
          pathToFileURL(process.argv[1]).href === import.meta.url)),
  );

if (isDirectCliRun) {
  main().catch((err) => {
    console.error('[PRE-1] Fatal error during cleanup:', err);
    process.exit(1);
  });
}
