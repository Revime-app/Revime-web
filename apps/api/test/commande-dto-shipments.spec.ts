import { describe, expect, it, vi } from 'vitest';
import { CommandesService, presentShipments } from '../src/commandes/commandes.service.js';

/** Deliberate break #6's gate: a carrier scan may move a SENDING step and nothing else (Q3). */
describe('advanceBySystem restriction', () => {
  it('refuses a receiving step before reading anything', async () => {
    const prisma = { commande: { findFirst: vi.fn() } };
    const svc = new CommandesService(prisma as never, { emit: vi.fn() } as never, {
      postSystemMessage: vi.fn(),
      announce: vi.fn(),
    } as never);
    await expect(svc.advanceBySystem('c1', 'PARCEL_RECEIVED')).rejects.toThrow(/refuses PARCEL_RECEIVED/);
    await expect(svc.advanceBySystem('c1', 'RETURN_RECEIVED')).rejects.toThrow(/refuses/);
    expect(prisma.commande.findFirst).not.toHaveBeenCalled();
  });
});

const row = (over: Record<string, unknown>) => ({
  leg: 'OUTBOUND' as const,
  status: 'LABEL_READY' as const,
  carrierLabel: 'Mondial Relay',
  labelStoragePath: 'labels/c1/OUTBOUND.pdf' as string | null,
  events: [] as { status: string; occurredAt: Date; raw: unknown }[],
  ...over,
});

describe('presentShipments', () => {
  it('maps a leg to its DTO: labelReady from the stored path, latest status and French labels, newest event first', () => {
    const dto = presentShipments([
      row({
        events: [
          { status: 'ANNOUNCED', occurredAt: new Date('2026-09-05T08:00:00Z'), raw: {} },
          { status: 'SHIPPED', occurredAt: new Date('2026-09-05T12:00:00Z'), raw: { packageTrackingUrl: 'https://track.example/1' } },
        ],
      }),
    ]);
    expect(dto).toEqual([
      {
        leg: 'OUTBOUND',
        status: 'LABEL_READY',
        carrierLabel: 'Mondial Relay',
        labelReady: true,
        trackingUrl: 'https://track.example/1',
        latestStatus: 'SHIPPED',
        events: [
          { status: 'SHIPPED', label: 'Pris en charge par le transporteur', occurredAt: '2026-09-05T12:00:00.000Z' },
          { status: 'ANNOUNCED', label: 'Étiquette créée', occurredAt: '2026-09-05T08:00:00.000Z' },
        ],
      },
    ]);
  });

  it('a PENDING leg with no label and no events is honest about it', () => {
    expect(presentShipments([row({ status: 'PENDING', labelStoragePath: null })])[0]).toMatchObject({
      labelReady: false,
      trackingUrl: null,
      latestStatus: null,
      events: [],
    });
  });

  it('an unknown carrier status renders its raw code as the label rather than throwing', () => {
    const [d] = presentShipments([row({ events: [{ status: 'NEW_THING', occurredAt: new Date(0), raw: {} }] })]);
    expect(d!.events[0]!.label).toBe('NEW_THING');
  });
});
