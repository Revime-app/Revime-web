import { describe, expect, it } from 'vitest';
import { ADMIN_PERMISSIONS, ROLE_PERMISSIONS, type AdminMe, type AdminRole } from '@revime/shared';
import { hasPermission, staffControlsVisible } from '../lib/permissions';

/** CF4-40 (sub-project N, spec §4.4). What the dashboard shows each role. The API decides. */

const me = (role: AdminRole, twoFactorVerified = true): AdminMe => ({
  role,
  permissions: [...ROLE_PERMISSIONS[role]],
  twoFactorVerified,
});

describe('hasPermission', () => {
  it('is false without an admin/me answer', () => {
    for (const p of ADMIN_PERMISSIONS) expect(hasPermission(null, p)).toBe(false);
  });

  it('gives read_only no write permission at all', () => {
    for (const p of ADMIN_PERMISSIONS.filter((x) => x !== 'dashboard.read')) {
      expect(hasPermission(me('read_only'), p)).toBe(false);
    }
    expect(hasPermission(me('read_only'), 'dashboard.read')).toBe(true);
  });

  it('follows the matrix for support and finance', () => {
    expect(hasPermission(me('support'), 'verification.decide')).toBe(true);
    expect(hasPermission(me('support'), 'refunds.issue')).toBe(false);
    expect(hasPermission(me('finance'), 'refunds.issue')).toBe(true);
    expect(hasPermission(me('finance'), 'disputes.resolve')).toBe(true);
    expect(hasPermission(me('finance'), 'conversations.read')).toBe(false);
  });

  it('reads the role, not a tampered permissions list', () => {
    const forged = { role: 'read_only', permissions: [...ADMIN_PERMISSIONS], twoFactorVerified: true } as AdminMe;
    expect(hasPermission(forged, 'refunds.issue')).toBe(false);
  });

  it('shows nothing to a session without its second factor', () => {
    expect(hasPermission(me('super_admin', false), 'dashboard.read')).toBe(false);
  });
});

describe('staffControlsVisible', () => {
  it('only for a Super Admin, and never on their own fiche', () => {
    expect(staffControlsVisible(me('super_admin'), 'u2', 'u1')).toBe(true);
    expect(staffControlsVisible(me('super_admin'), 'u1', 'u1')).toBe(false);
    for (const role of ['admin', 'moderation', 'support', 'finance', 'read_only'] as const) {
      expect(staffControlsVisible(me(role), 'u2', 'u1')).toBe(false);
    }
    expect(staffControlsVisible(null, 'u2', 'u1')).toBe(false);
  });
});


describe('AdminNav: « Paramètres » (profile, security, sign-out)', () => {
  it('links /parametres once and no longer has a separate « Sécurité » entry', async () => {
    const { LINKS } = await import('../components/AdminNav');
    expect(LINKS.filter((l) => l.href === '/parametres')).toEqual([{ href: '/parametres', label: 'Paramètres' }]);
    expect(LINKS.some((l) => l.href === '/parametres')).toBe(true);
    expect(LINKS.some((l) => l.href === '/securite')).toBe(false);
  });
});
