import { describe, expect, it, vi } from 'vitest';
import { AdminDemandesService, stateOf } from '../src/admin/admin-demandes.service.js';
// From admin-constants, which is where Task 5 moved it - NOT re-exported through the service.
// A re-export purely to satisfy a test import is how a constant ends up with two homes.
import { PAGE_SIZE } from '../src/admin/admin-constants.js';
import { ACCEPTABLE_OFFER_WHERE } from '../src/offers/offer-predicates.js';

function prismaStub(rows: unknown[] = [], total = 0) {
  return {
    $transaction: vi.fn().mockImplementation(async (ops: unknown[]) => [rows, total].slice(0, ops.length)),
    demande: {
      findMany: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(total)
    },
  };
}

const svc = (p: ReturnType<typeof prismaStub>) =>
  new AdminDemandesService(p as never);

describe('stateOf', () => {
  it('deletedAt wins over hiddenAt when both are set', () => {
    expect(stateOf({ deletedAt: new Date(), hiddenAt: new Date() })).toBe('supprimee');
  });
  it('hiddenAt alone is masquee', () => {
    expect(stateOf({ deletedAt: null, hiddenAt: new Date() })).toBe('masquee');
  });
  it('neither is visible', () => {
    expect(stateOf({ deletedAt: null, hiddenAt: null })).toBe('visible');
  });
});

describe('AdminDemandesService.list', () => {
  it('clamps a NaN page to 1', async () => {
    const p = prismaStub();
    await svc(p).list({ page: Number.NaN });
    expect(p.demande.findMany.mock.calls[0]![0]!.skip).toBe(0);
  });

  it('clamps a negative page to 1', async () => {
    const p = prismaStub();
    await svc(p).list({ page: -5 });
    expect(p.demande.findMany.mock.calls[0]![0]!.skip).toBe(0);
  });

  it('pages with PAGE_SIZE', async () => {
    const p = prismaStub();
    await svc(p).list({ page: 3 });
    expect(p.demande.findMany.mock.calls[0]![0]!.skip).toBe(2 * PAGE_SIZE);
    expect(p.demande.findMany.mock.calls[0]![0]!.take).toBe(PAGE_SIZE);
  });

  /**
   * 🛑 The default hides nothing. An operator's list is the ONE place a hidden or deleted
   * demande must remain visible, which is the opposite of every other read in this codebase
   * and the reason `VISIBLE_DEMANDE_WHERE` is demande-scoped rather than folded into LIVE.
   */
  it('shows every state by default', async () => {
    const p = prismaStub();
    await svc(p).list({});
    const where = JSON.stringify(p.demande.findMany.mock.calls[0]![0]!.where);
    expect(where).not.toContain('hiddenAt');
    expect(where).not.toContain('deletedAt');
  });

  it('etat=masquee filters on hiddenAt set and deletedAt null', async () => {
    const p = prismaStub();
    await svc(p).list({ etat: 'masquee' });
    expect(p.demande.findMany.mock.calls[0]![0]!.where).toEqual({
      AND: [{ hiddenAt: { not: null }, deletedAt: null }],
    });
  });

  it('etat=supprimee filters on deletedAt set', async () => {
    const p = prismaStub();
    await svc(p).list({ etat: 'supprimee' });
    expect(p.demande.findMany.mock.calls[0]![0]!.where).toEqual({
      AND: [{ deletedAt: { not: null } }],
    });
  });

  /**
   * 🛑 An unknown value must return neither everything nor nothing. Returning everything
   * silently ignores the operator; returning nothing reads as « no demande matches » and
   * invites the conclusion that rows were deleted. It is validated against the enum and
   * ignored, exactly as `admin-users.service.ts` does - and the test asserts the WHERE, so
   * "ignored" is proven rather than described.
   */
  it('ignores an unknown etat instead of passing it to Prisma', async () => {
    const p = prismaStub();
    await svc(p).list({ etat: 'bogus' });
    expect(JSON.stringify(p.demande.findMany.mock.calls[0]![0]!.where)).not.toContain('bogus');
  });

  it('ignores an unknown statut', async () => {
    const p = prismaStub();
    await svc(p).list({ statut: 'PENDING' });
    expect(JSON.stringify(p.demande.findMany.mock.calls[0]![0]!.where)).not.toContain('PENDING');
  });

  it('searches title, description, brand and model, case-insensitively', async () => {
    const p = prismaStub();
    await svc(p).list({ q: '  ecran  ' });
    const where = JSON.stringify(p.demande.findMany.mock.calls[0]![0]!.where);
    expect(where).toContain('"title"');
    expect(where).toContain('"description"');
    expect(where).toContain('"brand"');
    expect(where).toContain('"model"');
    expect(where).toContain('insensitive');
    // trimmed
    expect(where).toContain('ecran');
    expect(where).not.toContain('  ecran');
  });

  it('a blank q adds no filter', async () => {
    const p = prismaStub();
    await svc(p).list({ q: '   ' });
    expect(JSON.stringify(p.demande.findMany.mock.calls[0]![0]!.where)).not.toContain('title');
  });

  it('filters a date range on createdAt with inclusive upper bound', async () => {
    const p = prismaStub();
    await svc(p).list({ du: '2026-09-01', au: '2026-09-30' });
    const where = p.demande.findMany.mock.calls[0]![0]!.where;
    expect(where.AND[0]!.createdAt).toMatchObject({
      gte: new Date('2026-09-01'),
      lt: new Date('2026-10-01'),
    });
  });

  /**
   * 🛑 The single-day query (du === au) must produce bounds exactly one day apart.
   * Without this, the natural query for « demandes created on 30 September » returns empty.
   */
  it('du === au produces gte and lt exactly one day apart', async () => {
    const p = prismaStub();
    await svc(p).list({ du: '2026-09-30', au: '2026-09-30' });
    const where = p.demande.findMany.mock.calls[0]![0]!.where;
    expect(where.AND[0]!.createdAt).toMatchObject({
      gte: new Date('2026-09-30'),
      lt: new Date('2026-10-01'),
    });
  });

  /**
   * 🛑 An unparseable date must be IGNORED, not passed to Prisma as `Invalid Date`, which
   * throws at the driver and renders as « Une erreur est survenue. » for a typo in a date box.
   */
  it('ignores an unparseable date', async () => {
    const p = prismaStub();
    await svc(p).list({ du: 'not-a-date' });
    expect(JSON.stringify(p.demande.findMany.mock.calls[0]![0]!.where)).not.toContain('createdAt');
  });

  /**
   * 🛑 Pins WHICH predicate, not its shape. The client's own demandes list counts under
   * ACCEPTABLE_OFFER_WHERE, and this count must agree with it - a suspended réparateur's
   * offer must be invisible to both. Swapping in LIVE_OFFER_WHERE here passed every other
   * test in this file, which is why this one exists.
   */
  it('counts offers under ACCEPTABLE_OFFER_WHERE so the figure agrees with the client list', async () => {
    const p = prismaStub();
    await svc(p).list({});
    expect(p.demande.findMany.mock.calls[0]![0]!.select._count.select.offers.where).toEqual(
      ACCEPTABLE_OFFER_WHERE,
    );
  });
});
