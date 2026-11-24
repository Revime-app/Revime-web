import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminDemandesService } from '../src/admin/admin-demandes.service.js';
import { AppException } from '../src/common/app-exception.js';
import { FakeStorageGateway, __resetStorageGateway, storageGateway } from '../src/storage/gateway.js';

const BASE = {
  id: 'd1',
  title: 'Écran cassé',
  description: 'Tombé',
  brand: 'Apple',
  model: 'iPhone 12',
  parts: 'UNKNOWN',
  mode: 'OFFERS',
  budgetCents: null,
  locationLabel: 'Paris 11e',
  postalCode: '75011',
  status: 'OPEN',
  categoryId: 'c1',
  createdAt: new Date('2026-09-01T10:00:00Z'),
  deletedAt: null,
  hiddenAt: null,
  hiddenReason: null,
  deletedReason: null,
  hiddenByUserId: null,
  deletedByUserId: null,
  author: { id: 'u1', name: 'Alice', email: 'a@example.com' },
  category: { labelFr: 'Téléphone' },
  faultType: null,
  photos: [{ storagePath: 'p/1.jpg' }],
  offers: [],
  commandes: [],
};

function stub(row: unknown = BASE, extras: Record<string, unknown> = {}) {
  return {
    demande: { findUnique: vi.fn().mockResolvedValue(row) },
    $transaction: vi.fn().mockResolvedValue([[], [], [], [], 0]),
    conversation: { findMany: vi.fn().mockResolvedValue([]) },
    conversationReport: { findMany: vi.fn().mockResolvedValue([]) },
    review: { findMany: vi.fn().mockResolvedValue([]) },
    adminAuditLog: { findMany: vi.fn().mockResolvedValue([]) },
    commande: { count: vi.fn().mockResolvedValue(0) },
    ...extras,
  };
}

const savedEnv = { ...process.env };

// The pattern from `avatar-read-dtos.spec.ts:38-48`, not a hand-rolled stub: the gateway is a
// module-level singleton, so the reset is what stops one test's driver leaking into the next.
beforeEach(() => {
  __resetStorageGateway();
  process.env.STORAGE_DRIVER = 'fake';
});
afterEach(() => {
  process.env = { ...savedEnv };
  __resetStorageGateway();
});

describe('AdminDemandesService.detail', () => {
  it('404s on an unknown id, with the resource message', async () => {
    const svc = new AdminDemandesService(stub(null) as never);
    await expect(svc.detail('nope')).rejects.toThrow(AppException);
    await expect(svc.detail('nope')).rejects.toThrow('Ressource introuvable.');
  });

  /**
   * 🛑 The operator fiche must load a hidden AND a deleted demande. It is the only surface
   * that may, and it is the surface the moderation actions live on - a fiche that 404s after
   * a hide would leave the operator with no way to undo it.
   */
  it('loads a hidden demande and reports the state', async () => {
    const svc = new AdminDemandesService(
      stub({ ...BASE, hiddenAt: new Date(), hiddenReason: 'spam' }) as never,
    );
    const out = await svc.detail('d1');
    expect(out.state).toBe('masquee');
    expect(out.removalReason).toBe('spam');
  });

  it('loads a deleted demande', async () => {
    const svc = new AdminDemandesService(stub({ ...BASE, deletedAt: new Date() }) as never);
    expect((await svc.detail('d1')).state).toBe('supprimee');
  });

  /**
   * 🛑 The findUnique must carry NO visibility filter. Asserted on the ARGUMENT rather than
   * inferred from the two cases above, because a stub returns whatever it is told to.
   */
  it('asks Prisma for the row without a visibility filter', async () => {
    const p = stub();
    await new AdminDemandesService(p as never).detail('d1');
    // 🛑 The whole `where`, deep-equal. A `not.toContain('hiddenAt: null')` on a stringified
    // argument shipped here first and could never match - JSON.stringify writes
    // `"hiddenAt":null` - so it passed unconditionally. Pinning the exact object means ANY
    // added key fails, not just the two we happen to spell correctly.
    expect(p.demande.findUnique.mock.calls[0]![0]!.where).toEqual({ id: 'd1' });
  });

  it('selects the fault type and returns it (F12), null when the client gave none', async () => {
    const withType = stub({ ...BASE, faultType: { id: 'ft1', labelFr: 'Écran cassé', slug: 'ecran-casse' } });
    const detail = await new AdminDemandesService(withType as never).detail('d1');
    expect(detail.faultType).toEqual({ id: 'ft1', labelFr: 'Écran cassé', slug: 'ecran-casse' });
    expect(withType.demande.findUnique.mock.calls[0]![0]!.select.faultType).toEqual({
      select: { id: true, labelFr: true, slug: true },
    });

    expect((await new AdminDemandesService(stub() as never).detail('d1')).faultType).toBeNull();
  });

  it('reports paymentInFlight from a PENDING_PAYMENT count', async () => {
    const p = stub(BASE, { $transaction: vi.fn().mockResolvedValue([[], [], [], [], 1]) });
    expect((await new AdminDemandesService(p as never).detail('d1')).paymentInFlight).toBe(true);
  });

  /**
   * 🛑 Pins WHAT is counted, not that a count is read. Retargeting this at PAID passed every
   * other case in this file - the stub returns 1 regardless of the where - and the flag would
   * then warn the operator about the wrong rows. PENDING_PAYMENT is the only state in which a
   * client is holding an open Stripe page, which is the whole reason the flag exists.
   */
  it('counts PENDING_PAYMENT commandes on this demande, and nothing else', async () => {
    const p = stub();
    await new AdminDemandesService(p as never).detail('d1');
    expect(p.commande.count.mock.calls[0]![0]!.where).toEqual({
      demandeId: 'd1',
      status: 'PENDING_PAYMENT',
    });
  });

  it('reports removedByAdmin false for a client self-delete', async () => {
    const svc = new AdminDemandesService(
      stub({ ...BASE, deletedAt: new Date(), deletedByUserId: null }) as never,
    );
    expect((await svc.detail('d1')).removedByAdmin).toBe(false);
  });

  it('reports the DELETE reason when a demande was hidden and then deleted', async () => {
    const svc = new AdminDemandesService(
      stub({
        ...BASE,
        hiddenAt: new Date('2026-09-01T00:00:00Z'),
        hiddenReason: 'triage',
        deletedAt: new Date('2026-09-02T00:00:00Z'),
        deletedReason: 'non conforme',
      }) as never,
    );
    const out = await svc.detail('d1');
    // Matches stateOf: deletedAt wins, so the reason shown is the verdict's, not the triage's.
    expect(out.state).toBe('supprimee');
    expect(out.removalReason).toBe('non conforme');
  });
});

describe('the admin timeline carries actorEmail as a field', () => {
  /**
   * 🛑 B1's follow-up #6. The fiche used to recover this with
   * `entry.label.split(' par ')[1]`. This asserts the FIELD, so the page can stop parsing.
   */
  it('emits actorEmail on admin rows', async () => {
    const p = stub(BASE, {
      $transaction: vi.fn().mockResolvedValue([
        [],
        [],
        [],
        [
          {
            id: 'a1',
            action: 'demande.hide',
            createdAt: new Date('2026-09-02T10:00:00Z'),
            actorEmail: 'ops@revime.fr',
          },
        ],
        0,
      ]),
    });
    const out = await new AdminDemandesService(p as never).detail('d1');
    const admin = out.activity.find((e) => e.kind === 'admin');
    expect(admin?.actorEmail).toBe('ops@revime.fr');
    // And the label still reads for a human, without being the transport for the email.
    expect(admin?.label).toContain('demande.hide');
  });
});

describe('the fiche signs its photos', () => {
  it('drops a path the gateway did not return rather than rendering undefined', async () => {
    // Seed the fake the way a completed upload would, for ONE of the two paths.
    const gw = storageGateway() as FakeStorageGateway;
    gw.seed('p/1.jpg');

    const p = stub({ ...BASE, photos: [{ storagePath: 'p/1.jpg' }, { storagePath: 'p/2.jpg' }] });
    const out = await new AdminDemandesService(p as never).detail('d1');

    // 🛑 One URL, not two, and no `undefined` in the array. The FakeStorageGateway's own
    // contract is that `createSignedReadUrls` OMITS what it cannot sign - `demandes.service.ts`
    // relies on the same behaviour at :864.
    expect(out.photoUrls).toHaveLength(1);
    expect(out.photoUrls.every((u) => typeof u === 'string')).toBe(true);
  });
});

describe('timeline timestamps come from each entity own createdAt', () => {
  /**
   * 🛑 The offer's timeline entry must carry the OFFER's `createdAt`, not the demande's,
   * so offers created at different times sort correctly in the merged timeline.
   */
  it('stamps an offer timeline entry with the offer own createdAt', async () => {
    const offerDate = new Date('2026-09-02T14:00:00Z');
    const p = stub(
      {
        ...BASE,
        offers: [
          {
            id: 'o1',
            status: 'SENT',
            priceCents: 10000,
            createdAt: offerDate,
            repairer: { name: 'Bob' },
          },
        ],
      },
      {
        $transaction: vi.fn().mockResolvedValue([[], [], [], [], 0]),
      },
    );
    const out = await new AdminDemandesService(p as never).detail('d1');
    const offerEntry = out.activity.find((e) => e.kind === 'offre');
    expect(offerEntry?.at).toBe(offerDate.toISOString());
  });
});

describe('timeline labels use French status labels', () => {
  /**
   * 🛑 Commande timeline labels must render French status labels, not raw enum codes.
   */
  it('renders commande status in French', async () => {
    const p = stub(
      {
        ...BASE,
        commandes: [
          {
            id: 'cmd1',
            status: 'PAID',
            totalCents: 12000,
            createdAt: new Date('2026-09-02T15:00:00Z'),
          },
        ],
      },
      {
        $transaction: vi.fn().mockResolvedValue([[], [], [], [], 0]),
      },
    );
    const out = await new AdminDemandesService(p as never).detail('d1');
    const commandeEntry = out.activity.find((e) => e.kind === 'commande');
    expect(commandeEntry?.label).toContain('Payé');
    expect(commandeEntry?.label).not.toContain('PAID');
  });
});
