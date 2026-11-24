import { describe, expect, it } from 'vitest';
import { USER_DETAIL_SELECT } from '../src/admin/admin-users.service.js';
import { detailUser, makeUsersService } from './admin-user-detail-fixture.js';

/**
 * A1: the « Informations fiscales » block of the user page. Fixtures come from `detailUser()`, typed
 * from the select the service runs (RU-29). The reminder itself is `FiscalService.remindOne`, specified
 * in `fiscal-remind-one.spec.ts`; here only that the service hands over to it.
 */
describe('Admin Users Fiscal Extension (A-1)', () => {
  it('returns fiscal: null for a client-only user with no fiscal records', async () => {
    const { service, prisma } = makeUsersService();
    prisma.user.findUnique.mockResolvedValue(detailUser({ repairerProfile: null, fiscalDeclaration: null }));

    expect((await service.detail('usr-1')).fiscal).toBeNull();
  });

  it('reads the bank account\'s last four from the Connect account, and nothing else of it', () => {
    expect(USER_DETAIL_SELECT.connectAccount).toEqual({ select: { ibanLast4: true } });
  });

  it('shows what is held, declared as such: legal name from first and last name, date of birth, address, masked IBAN', async () => {
    const { service, prisma } = makeUsersService();
    prisma.user.findUnique.mockResolvedValue(
      detailUser({
        name: 'cmartin',
        repairerProfile: {
          id: 'rp-1',
          kind: 'INDIVIDUAL',
          fiscalCompletedAt: null,
          fiscalReminderCount: 1,
          lastFiscalReminderAt: new Date('2026-10-03T10:00:00.000Z'),
        },
        fiscalDeclaration: {
          addressLine: '12 rue des Lilas',
          postalCode: '69003',
          city: 'Lyon',
          country: 'FR',
          nif: null,
          hasNoNif: true,
          birthCity: null,
          birthCountry: null,
        },
        connectAccount: { ibanLast4: '0412' },
      }),
    );
    prisma.repairerFiscalAuditLog.findMany.mockResolvedValue([
      { id: 'a1', fieldName: 'reminder', oldValue: null, newValue: 'relance_1', changedAt: new Date('2026-10-03T10:00:00.000Z') },
    ]);

    const { fiscal } = await service.detail('usr-1');

    expect(fiscal).toEqual({
      isComplete: false,
      legalName: 'Camille Martin',
      birthDate: '14/03/1995',
      address: '12 rue des Lilas, 69003 Lyon',
      nif: null,
      hasNoNif: true,
      birthCity: null,
      birthCountry: null,
      siret: null,
      vatNumber: null,
      maskedIban: '•••• 0412',
      reminderCount: 1,
      lastReminderAt: '2026-10-03T10:00:00.000Z',
      auditLogs: [
        { id: 'a1', fieldName: 'reminder', oldValue: null, newValue: 'relance_1', changedAt: '2026-10-03T10:00:00.000Z' },
      ],
    });
    // The display name never stands in for the legal name, and no « source » badge is carried.
    expect(fiscal).not.toHaveProperty('nameSource');
    expect(fiscal).not.toHaveProperty('birthDateSource');
  });

  it('shows no IBAN, never an invented one, for an account with no synced bank account', async () => {
    const { service, prisma } = makeUsersService();
    prisma.user.findUnique.mockResolvedValue(detailUser({ connectAccount: { ibanLast4: null } }));
    expect((await service.detail('usr-1')).fiscal?.maskedIban).toBeNull();

    prisma.user.findUnique.mockResolvedValue(detailUser({ connectAccount: null }));
    expect((await service.detail('usr-1')).fiscal?.maskedIban).toBeNull();
  });

  it('bounds the history it loads to the 50 newest entries', async () => {
    const { service, prisma } = makeUsersService();
    prisma.user.findUnique.mockResolvedValue(detailUser());
    await service.detail('usr-1');
    expect(prisma.repairerFiscalAuditLog.findMany).toHaveBeenCalledWith({
      where: { userId: 'usr-1' },
      orderBy: { changedAt: 'desc' },
      take: 50,
    });
  });

  it('falls back to the display name only when no legal name is on record', async () => {
    const { service, prisma } = makeUsersService();
    prisma.user.findUnique.mockResolvedValue(detailUser({ name: 'Camille M', firstName: null, lastName: null }));
    expect((await service.detail('usr-1')).fiscal?.legalName).toBe('Camille M');
  });

  it('is complete once the declaration was submitted', async () => {
    const { service, prisma } = makeUsersService();
    prisma.user.findUnique.mockResolvedValue(
      detailUser({
        repairerProfile: {
          id: 'rp-1',
          kind: 'INDIVIDUAL',
          fiscalCompletedAt: new Date('2026-10-12'),
          fiscalReminderCount: 0,
          lastFiscalReminderAt: null,
        },
      }),
    );
    expect((await service.detail('usr-1')).fiscal?.isComplete).toBe(true);
  });

  it('is complete for an approved professional with no declaration: the golden rule\'s own definition, not just fiscalCompletedAt', async () => {
    const { service, prisma } = makeUsersService();
    prisma.user.findUnique.mockResolvedValue(
      detailUser({
        profile: {
          deletedAt: null,
          clientEnabled: false,
          repairerEnabled: true,
          activeMode: 'REPAIRER',
          verificationLevel: 'BUSINESS',
        },
        repairerProfile: {
          id: 'rp-1',
          kind: 'PRO',
          fiscalCompletedAt: null,
          fiscalReminderCount: 0,
          lastFiscalReminderAt: null,
        },
        businessVerification: { status: 'APPROVED', siret: '80835976400020', vatNumber: null },
      }),
    );
    const { fiscal } = await service.detail('usr-1');
    expect(fiscal?.isComplete).toBe(true);
    expect(fiscal?.siret).toBe('80835976400020');
  });

  it('is incomplete for a professional whose business verification is not approved', async () => {
    const { service, prisma } = makeUsersService();
    prisma.user.findUnique.mockResolvedValue(
      detailUser({
        repairerProfile: {
          id: 'rp-1',
          kind: 'PRO',
          fiscalCompletedAt: null,
          fiscalReminderCount: 0,
          lastFiscalReminderAt: null,
        },
        businessVerification: { status: 'PENDING', siret: '80835976400020', vatNumber: null },
      }),
    );
    expect((await service.detail('usr-1')).fiscal?.isComplete).toBe(false);
  });

  it('hands the reminder to FiscalService and reports what it recorded', async () => {
    const { service, fiscal } = makeUsersService();
    fiscal.remindOne.mockResolvedValue({ reminderCount: 2, lastReminderAt: new Date('2026-10-19T09:00:00Z') });

    expect(await service.sendFiscalReminder('usr-1')).toEqual({
      success: true,
      reminderCount: 2,
      lastReminderAt: '2026-10-19T09:00:00.000Z',
    });
    expect(fiscal.remindOne).toHaveBeenCalledWith('usr-1');
  });
});
