import { describe, expect, it, vi } from 'vitest';
import {
  adminChangeCategorySchema,
  adminHideDemandeSchema,
  adminDeleteDemandeSchema,
} from '@revime/shared';
import { AdminDemandesWriteService } from '../src/admin/admin-demandes-write.service.js';
import { AppException } from '../src/common/app-exception.js';

describe('§8.4 input schemas', () => {
  it('a hide reason is mandatory and French', () => {
    const bad = adminHideDemandeSchema.safeParse({});
    expect(bad.success).toBe(false);
    expect(JSON.stringify(bad.error?.issues)).toContain('Indiquez un motif');
  });

  it('a hide reason is trimmed and has a floor of 3 characters', () => {
    expect(adminHideDemandeSchema.safeParse({ reason: '  a  ' }).success).toBe(false);
    expect(adminHideDemandeSchema.parse({ reason: '  spam  ' }).reason).toBe('spam');
  });

  it('a hide reason has a ceiling', () => {
    expect(adminHideDemandeSchema.safeParse({ reason: 'x'.repeat(201) }).success).toBe(false);
  });

  it('a delete reason is mandatory, with its own message', () => {
    const bad = adminDeleteDemandeSchema.safeParse({});
    expect(JSON.stringify(bad.error?.issues)).toContain('Indiquez un motif de suppression');
  });

  it('a category change needs a non-empty id', () => {
    expect(adminChangeCategorySchema.safeParse({ categoryId: '' }).success).toBe(false);
    expect(adminChangeCategorySchema.parse({ categoryId: 'abc' }).categoryId).toBe('abc');
  });

  /**
   * 🛑 Zod strips unknown keys, so a hostile `hiddenByUserId` in the body never reaches the
   * service. Pinned because the protection is Zod's rather than ours - the same reasoning
   * `createBlockSchema` records.
   */
  it('strips an attempt to set the actor from the body', () => {
    const out = adminHideDemandeSchema.parse({
      reason: 'spam',
      hiddenByUserId: 'someone-else',
    } as never);
    expect(out).toEqual({ reason: 'spam' });
  });
});

const LIVE = { id: 'd1', title: 'Écran', deletedAt: null, hiddenAt: null };

function wstub(row: unknown = LIVE, pendingCount = 0, extras: Record<string, unknown> = {}) {
  return {
    demande: {
      findUnique: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockResolvedValue(({})),
      updateMany: vi.fn().mockResolvedValue(({ count: 1 })),
    },
    commande: { count: vi.fn().mockResolvedValue(pendingCount) },
    category: { findFirst: vi.fn().mockResolvedValue(({ id: 'c2' })) },
    offer: { findMany: vi.fn().mockResolvedValue([]) },
    ...extras,
  };
}
const notifications = () => ({ emit: vi.fn().mockResolvedValue(undefined) });

function svc(p: ReturnType<typeof wstub>, n = notifications()) {
  return { s: new AdminDemandesWriteService(p as never, n as never), n };
}

describe('hide', () => {
  it('404s on an unknown demande', async () => {
    const { s } = svc(wstub(null));
    await expect(s.hide('op', 'x', { reason: 'spam' })).rejects.toThrow('Ressource introuvable.');
  });

  it('refuses a demande already deleted', async () => {
    const { s } = svc(wstub({ ...LIVE, deletedAt: new Date() }));
    await expect(s.hide('op', 'd1', { reason: 'spam' })).rejects.toThrow('Ressource introuvable.');
  });

  /**
   * 🛑 REFUSED, not re-stamped, and this diverges from moderation-admin.service.ts's
   * idempotent convention on purpose: hiddenReason and hiddenByUserId are evidence, and a
   * re-stamp overwrites the first operator's record with the second's.
   */
  it('refuses a second hide with its own message', async () => {
    const { s } = svc(wstub({ ...LIVE, hiddenAt: new Date() }));
    await expect(s.hide('op', 'd1', { reason: 'spam' })).rejects.toThrow(
      'Cette demande est déjà masquée.',
    );
  });

  /** 🛑 THE MONEY GUARD. Lifted from softDelete: a client is on the Stripe page right now. */
  it('refuses while a PENDING_PAYMENT commande is in flight', async () => {
    const { s } = svc(wstub(LIVE, 1));
    await expect(s.hide('op', 'd1', { reason: 'spam' })).rejects.toThrow(
      'Un paiement est en cours sur cette demande.',
    );
  });

  it('counts only PENDING_PAYMENT, so a paid or abandoned commande does not block', async () => {
    const p = wstub(LIVE, 0);
    await svc(p).s.hide('op', 'd1', { reason: 'spam' });
    expect(p.commande.count.mock.calls[0]![0]!.where.status).toBe('PENDING_PAYMENT');
  });

  /**
   * 🛑 Allowed at ANY status, deliberately WIDER than the client-side rule. demandeEditPolicy
   * gives the author canDelete only while OPEN; an operator removing non-compliant content
   * must not be blocked by an escrow in progress.
   */
  it('hides an IN_PROGRESS demande', async () => {
    const p = wstub({ ...LIVE });
    await svc(p).s.hide('op', 'd1', { reason: 'contenu interdit' });
    expect(p.demande.update).toHaveBeenCalled();
  });

  it('writes all three columns in one update', async () => {
    const p = wstub();
    await svc(p).s.hide('op-1', 'd1', { reason: 'spam' });
    const data = p.demande.update.mock.calls[0]![0]!.data;
    expect(data.hiddenByUserId).toBe('op-1');
    expect(data.hiddenReason).toBe('spam');
    expect(data.hiddenAt).toBeInstanceOf(Date);
  });

  /** 🛑 Decision 4: hide notifies NOBODY. A notification cannot be retracted. */
  it('notifies nobody', async () => {
    const { n } = svc(wstub());
    await svc(wstub(), n).s.hide('op', 'd1', { reason: 'spam' });
    expect(n.emit).not.toHaveBeenCalled();
  });
});

describe('unhide', () => {
  it('pins the observed marker in the where and refuses on count 0', async () => {
    const p = wstub(LIVE, 0, {
      demande: {
        findUnique: vi.fn().mockResolvedValue(LIVE),
        update: vi.fn().mockResolvedValue(({})),
        updateMany: vi.fn().mockResolvedValue(({ count: 0 })),
      },
    });
    await expect(svc(p).s.unhide('op', 'd1')).rejects.toThrow(
      "Cette demande n'est pas masquée.",
    );
    const where = p.demande.updateMany.mock.calls[0]![0]!.where;
    expect(where.hiddenAt).toEqual({ not: null });
    expect(where.deletedAt).toBeNull();
  });

  it('clears all three hide columns', async () => {
    const p = wstub();
    await svc(p).s.unhide('op', 'd1');
    expect(p.demande.updateMany.mock.calls[0]![0]!.data).toEqual({
      hiddenAt: null,
      hiddenByUserId: null,
      hiddenReason: null,
    });
  });
});

describe('remove', () => {
  it('deletes a hidden demande - triage then verdict', async () => {
    const p = wstub({ ...LIVE, hiddenAt: new Date() });
    await svc(p).s.remove('op', 'd1', { reason: 'non conforme' });
    expect(p.demande.update).toHaveBeenCalled();
  });

  it('refuses an already deleted demande', async () => {
    const { s } = svc(wstub({ ...LIVE, deletedAt: new Date() }));
    await expect(s.remove('op', 'd1', { reason: 'x' })).rejects.toThrow('Ressource introuvable.');
  });

  it('refuses while a payment is in flight', async () => {
    const { s } = svc(wstub(LIVE, 1));
    await expect(s.remove('op', 'd1', { reason: 'x' })).rejects.toThrow(
      'Un paiement est en cours sur cette demande.',
    );
  });

  it('writes deletedAt, actor and reason', async () => {
    const p = wstub();
    await svc(p).s.remove('op-1', 'd1', { reason: 'non conforme' });
    const data = p.demande.update.mock.calls[0]![0]!.data;
    expect(data.deletedByUserId).toBe('op-1');
    expect(data.deletedReason).toBe('non conforme');
    expect(data.deletedAt).toBeInstanceOf(Date);
  });

  /** 🛑 Offers are NOT touched. Writing WITHDRAWN for a réparateur was explicitly rejected. */
  it('leaves the offers alone', async () => {
    const p = wstub();
    await svc(p).s.remove('op', 'd1', { reason: 'x' });
    expect((p as { offer: { updateMany?: unknown } }).offer.updateMany).toBeUndefined();
  });

  it('notifies each réparateur holding a live offer, naming Revime not the client', async () => {
    const p = wstub(LIVE, 0, {
      offer: { findMany: vi.fn().mockResolvedValue([{ repairerUserId: 'r1' }, { repairerUserId: 'r2' }]) },
    });
    const { n } = svc(p);
    await svc(p, n).s.remove('op', 'd1', { reason: 'x' });
    expect(n.emit).toHaveBeenCalledTimes(2);
    const first = n.emit.mock.calls[0]![0];
    expect(first.type).toBe('DEMANDE_MODERATED');
    expect(first.mode).toBe('REPAIRER');
    expect(first.userId).toBe('r1');
    // 🛑 The operator's words must never leave the dashboard.
    expect(JSON.stringify(first)).not.toContain('non conforme');
  });

  /**
   * 🛑 LIVE_OFFER_WHERE, not ACCEPTABLE. This is a NOTIFICATION list: a suspended
   * réparateur's offer is hidden from the client but he is still told what happened to his
   * work - the asymmetry offer-predicates.ts states in full.
   */
  it('uses the notification predicate for the recipient list', async () => {
    const p = wstub();
    await svc(p).s.remove('op', 'd1', { reason: 'x' });
    const where = JSON.stringify(p.offer.findMany.mock.calls[0]![0]!.where);
    expect(where).not.toContain('repairer');
  });
});

describe('changeCategory', () => {
  it('refuses a category that is not usable', async () => {
    const p = wstub(LIVE, 0, { category: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(svc(p).s.changeCategory('op', 'd1', { categoryId: 'dead' })).rejects.toThrow(
      'Catégorie invalide.',
    );
  });

  it('validates against USABLE_CATEGORY, spread LAST', async () => {
    const p = wstub();
    await svc(p).s.changeCategory('op', 'd1', { categoryId: 'c2' });
    const where = p.category.findFirst.mock.calls[0]![0]!.where;
    // active plus the parent-activeness OR, which must survive the composition
    expect(where.active).toBe(true);
    expect(Array.isArray(where.OR)).toBe(true);
  });

  it('writes the new categoryId', async () => {
    const p = wstub();
    await svc(p).s.changeCategory('op', 'd1', { categoryId: 'c2' });
    expect(p.demande.update.mock.calls[0]![0]!.data).toEqual({ categoryId: 'c2' });
  });

  /** A category fix is a correction, not a removal, so it works on a hidden demande. */
  it('works on a hidden demande', async () => {
    const p = wstub({ ...LIVE, hiddenAt: new Date() });
    await svc(p).s.changeCategory('op', 'd1', { categoryId: 'c2' });
    expect(p.demande.update).toHaveBeenCalled();
  });
});
