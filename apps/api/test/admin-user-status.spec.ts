import { describe, expect, it } from 'vitest';
import {
  ADMIN_AUDIT_ACTION_LABEL,
  DELETED_BAN_REASON,
  VERIFICATION_LEVEL_LABEL,
  adminAuditActionSchema,
  adminDeleteUserSchema,
  adminModerateUserSchema,
  adminSuspendUserSchema,
  formatAdminUserStatus,
  type AdminUserStatus,
  type AdminVerificationLevel,
} from '@revime/shared';

describe('adminAuditActionSchema carries B1 actions', () => {
  it('accepts the four §8.2 write actions', () => {
    for (const a of ['user.suspend', 'user.reactivate', 'user.delete', 'user.moderate']) {
      expect(adminAuditActionSchema.safeParse(a).success, a).toBe(true);
    }
  });

  it('accepts the three bridge actions, which AdminController cannot see', () => {
    for (const a of ['auth.admin.impersonate', 'auth.admin.stop_impersonating', 'auth.admin.other']) {
      expect(adminAuditActionSchema.safeParse(a).success, a).toBe(true);
    }
  });

  it('still refuses an unknown action, so the column stays a closed set', () => {
    expect(adminAuditActionSchema.safeParse('user.promote').success).toBe(false);
  });
});

describe('formatAdminUserStatus', () => {
  it('renders an active account', () => {
    expect(formatAdminUserStatus({ kind: 'active' })).toBe('Actif');
  });

  it('renders a permanent suspension without inventing a date', () => {
    expect(formatAdminUserStatus({ kind: 'suspended', reason: 'spam', until: null })).toBe('Suspendu');
  });

  // 🛑 The whole point of carrying `until`: Better Auth clears an expired ban only on the
  // next sign-in ATTEMPT, so `banned` stays true meanwhile. A bare « Suspendu » would tell
  // the operator the account is still shut when it is effectively open. Spec §2.2.
  it('renders a temporary suspension with its expiry', () => {
    const future = new Date(Date.now() + 86400000 * 7); // 7 days ahead
    const formatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
    const parts = formatter.formatToParts(future);
    const expectedMonth = parts.find((p) => p.type === 'month')?.value;
    const expectedYear = parts.find((p) => p.type === 'year')?.value;

    const out = formatAdminUserStatus({
      kind: 'suspended',
      reason: 'spam',
      until: future.toISOString(),
    });
    expect(out).toContain('Suspendu jusqu');
    expect(out).toContain(expectedMonth!);
    expect(out).toContain(expectedYear!);
  });

  it('renders a deleted account with its date', () => {
    const out = formatAdminUserStatus({ kind: 'deleted', at: '2026-08-30T00:00:00.000Z' });
    expect(out).toContain('Supprimé le');
    expect(out).toContain('août');
  });
});

describe('adminSuspendUserSchema', () => {
  it('requires a reason', () => {
    expect(adminSuspendUserSchema.safeParse({}).success).toBe(false);
    expect(adminSuspendUserSchema.safeParse({ reason: 'ab' }).success).toBe(false);
  });

  it('accepts a reason with no expiry', () => {
    expect(adminSuspendUserSchema.safeParse({ reason: 'Propos abusifs' }).success).toBe(true);
  });

  it('accepts an ISO expiry and refuses a non-ISO one', () => {
    const future = new Date(Date.now() + 86400000).toISOString(); // tomorrow
    expect(
      adminSuspendUserSchema.safeParse({ reason: 'Propos abusifs', until: future })
        .success,
    ).toBe(true);
    expect(adminSuspendUserSchema.safeParse({ reason: 'Propos abusifs', until: '12/09/2026' }).success).toBe(
      false,
    );
  });

  // 🛑 The collision guard. CF-47's scrub writes this exact banReason, and §8.1's KPI #4
  // and #8 both EXCLUDE it - so an operator typing it would silently erase the account
  // from « Comptes suspendus ». Spec §7 guard 2.
  it('refuses the account_deleted tombstone marker as a reason, with a French message', () => {
    const r = adminSuspendUserSchema.safeParse({ reason: DELETED_BAN_REASON });
    expect(r.success).toBe(false);
    if (r.success) throw new Error('expected failure');
    expect(r.error.issues.some((i) => i.message.includes('réservé'))).toBe(true);
  });

  // A past date produces: sessions deleted, banned:true written, the ban self-clearing at
  // the next sign-in, the operator told success, and an audit row reading user.suspend.
  // A suspension that does not suspend, reachable by an operator's typo.
  it('refuses an until date in the past, with a French message', () => {
    const past = new Date(Date.now() - 86400000).toISOString(); // yesterday
    const r = adminSuspendUserSchema.safeParse({ reason: 'spam', until: past });
    expect(r.success).toBe(false);
    if (r.success) throw new Error('expected failure');
    expect(r.error.issues.some((i) => i.message.includes('dans le futur'))).toBe(true);
  });

  it('accepts an until date in the future', () => {
    const future = new Date(Date.now() + 86400000).toISOString(); // tomorrow
    expect(adminSuspendUserSchema.safeParse({ reason: 'spam', until: future }).success).toBe(true);
  });
});

describe('adminModerateUserSchema', () => {
  it('refuses an empty body, so a no-op cannot write an audit row', () => {
    const r = adminModerateUserSchema.safeParse({});
    expect(r.success).toBe(false);
    if (r.success) throw new Error('expected failure');
    expect(r.error.issues.some((i) => i.message.includes('au moins un champ'))).toBe(true);
  });

  it('canonicalises a username to lowercase by reusing usernameSchema', () => {
    const r = adminModerateUserSchema.safeParse({ username: '  Camille  ' });
    expect(r.success).toBe(true);
    if (!r.success) throw new Error('expected success');
    expect(r.data.username).toBe('camille');
  });

  it('rejects a username usernameSchema already rejects', () => {
    expect(adminModerateUserSchema.safeParse({ username: '_bad' }).success).toBe(false);
  });

  it('accepts removeAvatar alone', () => {
    expect(adminModerateUserSchema.safeParse({ removeAvatar: true }).success).toBe(true);
  });
});

describe('adminDeleteUserSchema', () => {
  it('requires a reason, because the audit row is the only surviving record of the deletion', () => {
    expect(adminDeleteUserSchema.safeParse({}).success).toBe(false);
    expect(adminDeleteUserSchema.safeParse({ reason: 'Compte non conforme' }).success).toBe(true);
  });
});

describe('VERIFICATION_LEVEL_LABEL', () => {
  it('has a French label for every verification level', () => {
    const levels: AdminVerificationLevel[] = ['NONE', 'BASIC', 'IDENTITY', 'BUSINESS'];
    for (const level of levels) {
      expect(VERIFICATION_LEVEL_LABEL[level]).toBeTruthy();
      expect(VERIFICATION_LEVEL_LABEL[level].length).toBeGreaterThan(0);
    }
  });

  it('provides meaningful French labels', () => {
    expect(VERIFICATION_LEVEL_LABEL.NONE).toBe('Non vérifié');
    expect(VERIFICATION_LEVEL_LABEL.BASIC).toBe('Basique');
    expect(VERIFICATION_LEVEL_LABEL.IDENTITY).toBe('Identité vérifiée');
    expect(VERIFICATION_LEVEL_LABEL.BUSINESS).toBe('Professionnel');
  });
});

describe('ADMIN_AUDIT_ACTION_LABEL', () => {
  /**
   * Iterates the enum's options, so adding an action auto-extends coverage. No count
   * assertion: the "no missing key" direction is covered by this iteration, and the
   * "no extra key" direction is guaranteed by the `Record<AdminAuditAction, string>` type.
   */
  it('has a French label for every audit action', () => {
    const actions = adminAuditActionSchema.options;
    for (const action of actions) {
      expect(ADMIN_AUDIT_ACTION_LABEL[action]).toBeTruthy();
      expect(ADMIN_AUDIT_ACTION_LABEL[action].length).toBeGreaterThan(0);
    }
  });
});

describe('formatAdminUserStatus - expired suspension', () => {
  it('reports an expired suspension distinctly from a current one', () => {
    const past = new Date('2026-09-01T00:00:00.000Z');
    const expired: AdminUserStatus = {
      kind: 'suspended',
      reason: 'Test',
      until: past.toISOString(),
    };
    const formatted = formatAdminUserStatus(expired);
    expect(formatted).toContain('expirée');
    expect(formatted).toContain('1 septembre');
  });

  it('reports a not-yet-expired suspension with the original wording', () => {
    const future = new Date(Date.now() + 86400000 * 7); // 7 days ahead
    const current: AdminUserStatus = {
      kind: 'suspended',
      reason: 'Test',
      until: future.toISOString(),
    };
    const formatted = formatAdminUserStatus(current);
    expect(formatted).toMatch(/^Suspendu jusqu'au/);
    expect(formatted).not.toContain('expirée');
  });

  it('reports a permanent suspension with the original wording', () => {
    const permanent: AdminUserStatus = {
      kind: 'suspended',
      reason: 'Test',
      until: null,
    };
    expect(formatAdminUserStatus(permanent)).toBe('Suspendu');
  });
});
