import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminController } from '../src/admin/admin.controller.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { RefundService } from '../src/commandes/refund.service.js';

// The cancellation rules (status, Stripe check, CAS, side effects) live in
// `RefundService.cancelWithoutCharge` and are pinned by refund-cancel-without-charge.spec.ts.
// The controller's job is only to resolve the order reference to the canonical id, once, for both
// the service call and the audit target.
describe('AdminController.cancelCommande (Bug B3 route)', () => {
  let controller: AdminController;
  let prisma: { commande: { findUnique: ReturnType<typeof vi.fn> } };
  let refunds: { cancelWithoutCharge: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = { commande: { findUnique: vi.fn() } };
    refunds = { cancelWithoutCharge: vi.fn().mockResolvedValue(undefined) };
    const none = undefined as never;
    controller = new AdminController(
      prisma as unknown as PrismaService,
      refunds as unknown as RefundService,
      none, none, none, none, none, none, none, none, none, none, none, none, none,
    );
  });

  it('cancels through the service with the canonical id and re-points the audit target at it', async () => {
    prisma.commande.findUnique.mockResolvedValue({ id: 'cmd-full-uuid' });
    const req = { params: { id: 'short-ref' } };

    const result = await controller.cancelCommande('short-ref', req);

    expect(result).toEqual({ ok: true });
    expect(refunds.cancelWithoutCharge).toHaveBeenCalledWith('cmd-full-uuid');
    expect(req.params.id).toBe('cmd-full-uuid');
  });

  it('propagates a refusal from the service untouched', async () => {
    prisma.commande.findUnique.mockResolvedValue({ id: 'cmd-1' });
    refunds.cancelWithoutCharge.mockRejectedValueOnce(
      Object.assign(new Error('refus'), { code: 'UNPROCESSABLE_ENTITY' }),
    );

    await expect(controller.cancelCommande('cmd-1')).rejects.toMatchObject({ code: 'UNPROCESSABLE_ENTITY' });
  });
});
