import { describe, expect, it } from 'vitest';
import {
  adminAuditActionSchema,
  auditOk,
  formatKpiCents,
  formatKpiCount,
  kpi,
  kpiUnavailable,
} from '@revime/shared';

/**
 * Intl in Node emits U+202F (narrow no-break space) as the fr-FR group separator and
 * U+00A0 before the currency symbol. Asserting a literal ' ' fails on both. Normalise
 * rather than paste invisible codepoints into an assertion nobody can read.
 */
const flat = (s: string) => s.replace(/[  ]/g, ' ');

describe('formatKpiCount', () => {
  it('groups thousands in French', () => {
    expect(flat(formatKpiCount(kpi(1234)))).toBe('1 234');
  });

  it('renders zero as a real zero, because zero is a measurement', () => {
    expect(formatKpiCount(kpi(0))).toBe('0');
  });

  it('renders an unavailable KPI as text, never as 0', () => {
    expect(formatKpiCount(kpiUnavailable('aucune notion d\'expiration'))).toBe('Non applicable');
  });
});

describe('formatKpiCents', () => {
  it('formats cents as euros', () => {
    expect(flat(formatKpiCents(kpi(389020)))).toBe('3 890,20 €');
  });

  it('formats zero cents', () => {
    expect(flat(formatKpiCents(kpi(0)))).toBe('0,00 €');
  });

  it('renders an unavailable money KPI as text', () => {
    expect(formatKpiCents(kpiUnavailable('non suivi'))).toBe('Non applicable');
  });
});

describe('auditOk', () => {
  it.each([
    [200, true],
    [201, true],
    [399, true],
    [400, false],
    [403, false],
    [422, false],
    [500, false],
  ])('status %i -> ok %s', (status, expected) => {
    expect(auditOk(status)).toBe(expected);
  });
});

describe('adminAuditActionSchema', () => {
  /**
   * 🛑 MEMBERSHIP, NOT A COUNT. This asserted `toHaveLength(14)` and every later piece had
   * to bump it - roadmap follow-up #4. A count carries no information about WHICH action is
   * missing, and it fails for the one change that is always safe (adding one). Membership
   * fails only when something is actually gone.
   */
  it('contains every action the pieces built so far', () => {
    const options = adminAuditActionSchema.options as readonly string[];
    for (const action of [
      // Piece A
      'commande.parcel.issue_labels', 'commande.refund', 'report.resolve',
      'conversation.close', 'conversation.reopen', 'message.delete', 'review.delete',
      // Piece B1
      'user.suspend', 'user.reactivate', 'user.delete', 'user.moderate',
      'auth.admin.impersonate', 'auth.admin.stop_impersonating', 'auth.admin.other',
      // Piece B2
      'repairer.verification_revoke', 'repairer.verification_restore',
      'repairer.suspend', 'repairer.reactivate',
      // Piece C1
      'demande.category_change', 'demande.hide', 'demande.unhide', 'demande.delete',
      // Livraison Boxtal, spec §7.8
      'commande.shipment.retry',
    ]) {
      expect(options).toContain(action);
    }
  });

  it('rejects an unknown action, so a typo cannot reach the column', () => {
    expect(adminAuditActionSchema.safeParse('commande.refunded').success).toBe(false);
  });
});
