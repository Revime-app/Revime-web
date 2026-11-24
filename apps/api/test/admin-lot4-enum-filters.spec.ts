import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminExportsService } from '../src/admin/admin-exports.service.js';
import { AdminPayoutsService } from '../src/admin/admin-payouts.service.js';
import { CommandeStatus, CommandeStep } from '../src/generated/prisma/enums.js';

/**
 * RU-25 / N-9. The F5 and F6 specs mock Prisma with `vi.fn()`, so Prisma never validated a `where`,
 * and `status: { in: ['PAID', 'RELEASED', 'REFUNDED'] }` shipped: `RELEASED` is a CommandeStep, and
 * production answered every call with PrismaClientValidationError. This spec reads every `status`
 * and `step` the two services put in a `where` and checks it against the generated enums, which is
 * the part of Prisma's validation a mock removes.
 */
const STATUSES: readonly string[] = Object.values(CommandeStatus);
const STEPS: readonly string[] = Object.values(CommandeStep);

function collect(where: unknown, key: 'status' | 'step', into: string[] = []): string[] {
  if (Array.isArray(where)) {
    for (const part of where) collect(part, key, into);
  } else if (where && typeof where === 'object') {
    for (const [k, v] of Object.entries(where)) {
      if (k === key) {
        if (typeof v === 'string') into.push(v);
        else if (v && typeof v === 'object' && 'in' in v) into.push(...((v as { in: string[] }).in ?? []));
        else if (v && typeof v === 'object' && 'not' in v && typeof (v as { not: unknown }).not === 'string') {
          into.push((v as { not: string }).not);
        }
      } else {
        collect(v, key, into);
      }
    }
  }
  return into;
}

function expectValidEnums(where: unknown) {
  const statuses = collect(where, 'status');
  const steps = collect(where, 'step');
  for (const s of statuses) expect(STATUSES, `status "${s}" is not a CommandeStatus`).toContain(s);
  for (const s of steps) expect(STEPS, `step "${s}" is not a CommandeStep`).toContain(s);
}

function makePrisma() {
  return {
    commande: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _sum: {} }),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    connectAccount: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
  };
}

describe('F6 export queries only use values the Prisma enums contain', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AdminExportsService;
  const bounds = { start: new Date('2026-10-01T00:00:00Z'), end: new Date('2026-10-31T23:59:59Z') };

  beforeEach(() => {
    prisma = makePrisma();
    service = new AdminExportsService(prisma as never);
  });

  it('summary', async () => {
    await service.getExportSummary({ period: 'this_month' });
    for (const call of prisma.commande.findMany.mock.calls) expectValidEnums(call[0]!.where);
    expect(prisma.commande.findMany).toHaveBeenCalled();
  });

  it('collections report', async () => {
    await service.buildCollectionsReport(bounds, 'dupont', 25);
    for (const call of prisma.commande.findMany.mock.calls) expectValidEnums(call[0]!.where);
    for (const call of prisma.commande.count.mock.calls) expectValidEnums(call[0]!.where);
    expect(prisma.commande.findMany).toHaveBeenCalled();
  });

  it('commissions and VAT report', async () => {
    await service.buildCommissionsVatReport(bounds, 'dupont', 25);
    for (const call of prisma.commande.findMany.mock.calls) expectValidEnums(call[0]!.where);
    expect(prisma.commande.findMany).toHaveBeenCalled();
  });

  it('refunds report', async () => {
    await service.buildRefundsReport(bounds, 'dupont', 25);
    for (const call of prisma.commande.findMany.mock.calls) expectValidEnums(call[0]!.where);
    expect(prisma.commande.findMany).toHaveBeenCalled();
  });

  it('DAC7 report (CMP-D4)', async () => {
    await service.buildDac7Report(2026, 'dupont');
    for (const call of prisma.commande.findMany.mock.calls) expectValidEnums(call[0]!.where);
    expect(prisma.commande.findMany).toHaveBeenCalled();
  });

  it('a released order keeps status PAID, so the collections filter must include PAID and REFUNDED', async () => {
    await service.buildCollectionsReport(bounds, undefined, 25);
    const statuses = collect(prisma.commande.findMany.mock.calls[0]![0].where, 'status');
    expect(statuses).toEqual(expect.arrayContaining(['PAID', 'REFUNDED']));
  });
});

describe('F5 payout queries only use values the Prisma enums contain', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AdminPayoutsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AdminPayoutsService(prisma as never, {} as never);
  });

  // Amended 2026-11-18 by V8 `ISS8-013`: FAILED and HELD (new) read every candidate row and count what
  // they keep, so they make no `count` call; the where they send must still hold valid enum values.
  it.each(['ALL', 'TRANSFERRED', 'PENDING', 'HELD', 'FAILED', 'REVERSED'] as const)('listPayouts status=%s', async (status) => {
    await service.listPayouts({ status, period: 'all', page: 1, limit: 25, q: 'dupont' });
    expectValidEnums(prisma.commande.findMany.mock.calls[0]![0].where);
    for (const call of prisma.commande.count.mock.calls) expectValidEnums(call[0]!.where);
  });

  it('export', async () => {
    await service.exportCsv({ status: 'ALL', period: 'all' });
    expectValidEnums(prisma.commande.findMany.mock.calls[0]![0].where);
  });

  it('kpis, incomplete accounts', async () => {
    await service.getPayoutKpis();
    for (const call of prisma.commande.aggregate.mock.calls) expectValidEnums(call[0]!.where);
    for (const call of prisma.commande.count.mock.calls) expectValidEnums(call[0]!.where);
  });
});
