import { describe, expect, it, vi } from 'vitest';
import type { AdminUserDetail, AdminUserFiscalData } from '@revime/shared';
import { AdminController } from '../src/admin/admin.controller.js';

/**
 * RU-29 / A1. The fiscal block (NIF, date of birth, address, bank tail) is DAC7 data. The DAC7 report
 * needs `payments.manage` since RU-28; the same data on the user page was readable by every staff role
 * through `dashboard.read`. The fiche still opens for them, without the block.
 */
const fiscal: AdminUserFiscalData = {
  isComplete: false,
  legalName: 'Camille Martin',
  birthDate: '14/03/1995',
  address: '12 rue des Lilas, 69003 Lyon',
  nif: '0123456789012',
  hasNoNif: false,
  birthCity: null,
  birthCountry: null,
  siret: null,
  vatNumber: null,
  maskedIban: '•••• 0412',
  reminderCount: 0,
  lastReminderAt: null,
  auditLogs: [],
};

function controllerWith(detail: Partial<AdminUserDetail>) {
  const users = { detail: vi.fn().mockResolvedValue(detail) };
  const controller = new AdminController(
    {} as never, // prisma
    {} as never, // refunds
    {} as never, // cron
    {} as never, // catalog
    {} as never, // moderationAdmin
    {} as never, // overviewService
    {} as never, // auditService
    users as never,
    {} as never, // usersWrite
    {} as never, // repairers
    {} as never, // repairersWrite
    {} as never, // demandes
    {} as never, // demandesWrite
    {} as never, // offres
    {} as never, // shipments
  );
  return controller;
}

const sessionOf = (role: string | null) => ({ user: { id: 'op-1', role } }) as never;

describe('GET admin/users/:id and the fiscal block', () => {
  it.each(['super_admin', 'admin', 'finance'])('gives %s the block', async (role) => {
    const controller = controllerWith({ userId: 'u-1', fiscal });
    expect((await controller.userDetail(sessionOf(role), 'u-1')).fiscal).toEqual(fiscal);
  });

  it.each(['read_only', 'support', 'moderation'])('gives %s the fiche without the block', async (role) => {
    const controller = controllerWith({ userId: 'u-1', fiscal });
    const out = await controller.userDetail(sessionOf(role), 'u-1');
    expect(out.fiscal).toBeNull();
    expect(out.userId).toBe('u-1');
    expect(JSON.stringify(out)).not.toContain('0123456789012');
  });

  it('gives an unknown role no block either (deny by default)', async () => {
    const controller = controllerWith({ userId: 'u-1', fiscal });
    expect((await controller.userDetail(sessionOf(null), 'u-1')).fiscal).toBeNull();
  });
});
