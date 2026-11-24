import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { buildAttentionMail } from '../src/cron/attention-mail.js';
import { computeAmounts, type AdminAttentionItem } from '@revime/shared';

describe('buildAttentionMail', () => {
  const saved: Record<string, string | undefined> = {};

  beforeAll(() => {
    saved.OPS_EMAIL = process.env.OPS_EMAIL;
  });

  afterAll(() => {
    if (saved.OPS_EMAIL === undefined) delete process.env.OPS_EMAIL;
    else process.env.OPS_EMAIL = saved.OPS_EMAIL;
  });

  it('returns null when OPS_EMAIL is unset', () => {
    delete process.env.OPS_EMAIL;
    const items: AdminAttentionItem[] = [
      {
        commandeId: 'cmd_123',
        demandeTitle: 'Test repair',
        reason: 'STALLED',
        status: 'PAID',
        step: 'REPAIR_STARTED',
        totalCents: computeAmounts(8000, 'WORKSHOP').totalCents,
        since: '2026-01-01T00:00:00.000Z',
      },
    ];
    expect(buildAttentionMail(items)).toBeNull();
  });

  it('returns null when the list is empty', () => {
    process.env.OPS_EMAIL = 'ops@test.revime.fr';
    expect(buildAttentionMail([])).toBeNull();
  });

  it('returns a mail when OPS_EMAIL is set and items exist', () => {
    process.env.OPS_EMAIL = 'ops@test.revime.fr';
    const items: AdminAttentionItem[] = [
      {
        commandeId: 'cmd_123',
        demandeTitle: 'Test repair',
        reason: 'STALLED',
        status: 'PAID',
        step: 'REPAIR_STARTED',
        totalCents: computeAmounts(8000, 'WORKSHOP').totalCents,
        since: '2026-01-01T00:00:00.000Z',
      },
    ];
    const mail = buildAttentionMail(items);
    expect(mail).not.toBeNull();
    expect(mail?.to).toBe('ops@test.revime.fr');
    expect(mail?.subject).toContain('1 commande');
    expect(mail?.text).toContain('cmd_123');
    expect(mail?.text).toContain('Test repair');
  });

  it('contains no address or phone field', () => {
    process.env.OPS_EMAIL = 'ops@test.revime.fr';
    const items: AdminAttentionItem[] = [
      {
        commandeId: 'cmd_with_pii',
        demandeTitle: 'Repair at 123 Main St, call 0612345678',
        reason: 'DISPUTED',
        status: 'PAID',
        step: 'AWAITING_VALIDATION',
        totalCents: 10000,
        since: '2026-01-15T10:00:00.000Z',
      },
    ];
    const mail = buildAttentionMail(items);
    expect(mail).not.toBeNull();
    // The mail body should contain the commande id and truncated title, but no
    // standalone address or phone fields are present in AdminAttentionItem, so
    // this assertion verifies the structure does not include them.
    expect(mail?.text).toContain('cmd_with_pii');
    expect(mail?.text).not.toMatch(/line1|line2|postalCode|city|phone/i);
  });

  it('truncates long demande titles', () => {
    process.env.OPS_EMAIL = 'ops@test.revime.fr';
    const longTitle = 'A'.repeat(80);
    const items: AdminAttentionItem[] = [
      {
        commandeId: 'cmd_long',
        demandeTitle: longTitle,
        reason: 'CHARGE_MISSING',
        status: 'PAID',
        step: 'PAID',
        totalCents: 5000,
        since: '2026-02-01T12:00:00.000Z',
      },
    ];
    const mail = buildAttentionMail(items);
    expect(mail).not.toBeNull();
    // Title should be truncated to 60 chars + '...'
    expect(mail?.text).toContain('A'.repeat(60) + '...');
    expect(mail?.text).not.toContain('A'.repeat(61));
  });

  it('includes all eight reason labels', () => {
    process.env.OPS_EMAIL = 'ops@test.revime.fr';
    const reasons: Array<AdminAttentionItem['reason']> = [
      'STALLED',
      'DISPUTED',
      'REVERSAL_FAILED',
      'CHARGE_MISSING',
      'REFUND_INCOMPLETE',
      'RELEASE_FAILING',
      'SHIPMENT_FAILED',
      'SHIPMENT_EXCEPTION',
    ];
    const items: AdminAttentionItem[] = reasons.map((reason, i) => ({
      commandeId: `cmd_${i}`,
      demandeTitle: `Test ${reason}`,
      reason,
      status: 'PAID',
      step: 'AWAITING_VALIDATION',
      totalCents: 8000,
      since: '2026-01-01T00:00:00.000Z',
    }));
    const mail = buildAttentionMail(items);
    expect(mail).not.toBeNull();
    expect(mail?.text).toContain('Bloquée');
    expect(mail?.text).toContain('Contestée');
    // Not « Remboursement échoué »: in REVERSAL_FAILED the refund SUCCEEDED and the
    // clawback failed, so the money is with the réparateur and the old label pointed
    // the operator at the wrong remedy.
    expect(mail?.text).toContain('Récupération des fonds échouée');
    expect(mail?.text).not.toContain('Remboursement échoué');
    expect(mail?.text).toContain('Charge Stripe manquante');
    expect(mail?.text).toContain('Remboursement incomplet');
    expect(mail?.text).toContain('Déblocage en échec');
    // Livraison Boxtal (spec §7.8): a refused leg and a carrier incident are two different remedies.
    expect(mail?.text).toContain('Étiquette Boxtal en échec');
    expect(mail?.text).toContain('Incident transporteur');
  });
});
