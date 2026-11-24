import { describe, expect, it, vi } from 'vitest';
import { ATTENTION_UNDISMISSABLE_REASONS } from '@revime/shared';
import {
  PARCEL_STALL_AFTER_MS,
  shipmentAttentionItems,
} from '../src/cron/shipment-attention.js';
import { AdminController } from '../src/admin/admin.controller.js';
import { AdminShipmentsListService } from '../src/admin/admin-shipments-list.service.js';

const DAY = 24 * 3600 * 1000;

function parcelOrder(shipment: { status: string; updatedAt: Date; events?: { status: string; occurredAt: Date }[] }) {
  return {
    commandeId: 'cmd-1',
    demandeTitle: 'Drone',
    status: 'PAID' as const,
    step: 'PARCEL_SENT' as const,
    totalCents: 10000,
    updatedAt: new Date(),
    shipments: [{ leg: 'OUTBOUND', events: [], ...shipment }],
  };
}

describe('parcel attention rules shared by /attention and /colis', () => {
  it('the stall threshold is three days, one constant', () => {
    expect(PARCEL_STALL_AFTER_MS).toBe(3 * DAY);
  });

  it('flags every leg that is not over after three quiet days, PENDING (never ordered) included', () => {
    for (const status of ['PENDING', 'ORDERED', 'LABEL_READY', 'IN_TRANSIT']) {
      const items = shipmentAttentionItems([parcelOrder({ status, updatedAt: new Date(Date.now() - 4 * DAY) })]);
      expect(items.map((i) => i.reason)).toEqual(['PARCEL_BLOCKED']);
    }
  });

  it('does not flag a leg that moved recently, or one that is over', () => {
    expect(shipmentAttentionItems([parcelOrder({ status: 'IN_TRANSIT', updatedAt: new Date(Date.now() - 1 * DAY) })])).toEqual([]);
    for (const status of ['DELIVERED', 'CANCELLED']) {
      expect(shipmentAttentionItems([parcelOrder({ status, updatedAt: new Date(Date.now() - 9 * DAY) })])).toEqual([]);
    }
  });

  it('reads the newest carrier event as the last movement', () => {
    const items = shipmentAttentionItems([
      parcelOrder({
        status: 'IN_TRANSIT',
        updatedAt: new Date(Date.now() - 9 * DAY),
        events: [{ status: 'IN_TRANSIT', occurredAt: new Date(Date.now() - 1 * DAY) }],
      }),
    ]);
    expect(items).toEqual([]);
  });

  it('a failed delivery attempt is a carrier incident, like /colis shows it', () => {
    const items = shipmentAttentionItems([
      parcelOrder({
        status: 'IN_TRANSIT',
        updatedAt: new Date(),
        events: [{ status: 'FAILED_ATTEMPT', occurredAt: new Date() }],
      }),
    ]);
    expect(items.map((i) => i.reason)).toEqual(['PARCEL_INCIDENT']);
  });
});

describe('/colis offers a label only for orders that can ship', () => {
  it('lists unbooked parcel orders that are PAID, never PENDING_PAYMENT', async () => {
    const commandeFindMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      shipment: { findMany: vi.fn().mockResolvedValue([]) },
      commande: { findMany: commandeFindMany },
    };
    await new AdminShipmentsListService(prisma as never).list({ page: 1, pageSize: 25 });
    expect(commandeFindMany.mock.calls[0]![0].where).toMatchObject({ delivery: 'PARCEL', status: 'PAID' });
  });
});

describe('AdminController.dismissAttention', () => {
  function controller(items: { commandeId: string; reasons: string[] }[]) {
    const ctrl = Object.create(AdminController.prototype) as AdminController;
    Object.assign(ctrl, {
      resolveCommandeId: async (id: string) => `full-${id}`,
      cron: { attentionItems: vi.fn().mockResolvedValue(items) },
    });
    return ctrl;
  }
  const call = (ctrl: AdminController, req: { params: Record<string, string> }) =>
    ctrl.dismissAttention('c1', { reason: 'vu' }, req);

  it('accepts an order in the queue and points the audit trail at the resolved id', async () => {
    const req = { params: { id: 'c1' } };
    await expect(call(controller([{ commandeId: 'full-c1', reasons: ['STALLED'] }]), req)).resolves.toEqual({ ok: true });
    expect(req.params.id).toBe('full-c1');
  });

  it('refuses an order that is not in the queue (nothing to dismiss, nothing audited)', async () => {
    await expect(call(controller([]), { params: { id: 'c1' } })).rejects.toThrow('pas (ou plus) dans la liste');
  });

  it('refuses an order that ends by acting, not by being marked as handled', async () => {
    for (const reason of ATTENTION_UNDISMISSABLE_REASONS) {
      await expect(call(controller([{ commandeId: 'full-c1', reasons: ['STALLED', reason] }]), { params: { id: 'c1' } })).rejects.toThrow(
        'ne peut pas être marquée comme traitée'
      );
    }
  });
});
