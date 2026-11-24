import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { FiscalService } from '../src/fiscal/fiscal.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { __setMailSender } from '../src/mail/mail.service.js';

describe('FiscalService (CMP-D2 & CMP-D3)', () => {
  const USER_ID = 'user-123';

  let prismaMock: any;
  let commandesServiceMock: any;
  let notificationsServiceMock: any;
  let service: FiscalService;
  let sentMails: any[] = [];

  beforeEach(() => {
    sentMails = [];
    __setMailSender({
      send: async (mail) => {
        sentMails.push(mail);
      },
    });
    prismaMock = {
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      repairerProfile: {
        findMany: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      repairerFiscalDeclaration: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
      repairerFiscalAuditLog: {
        create: vi.fn(),
        createMany: vi.fn(),
      },
      $transaction: vi.fn(async (cb: any) => cb(prismaMock)),
    };
    commandesServiceMock = {
      payoutStrandedCommandes: vi.fn().mockResolvedValue(undefined),
    };
    notificationsServiceMock = {
      emit: vi.fn().mockResolvedValue(undefined),
    };
    service = new FiscalService(
      prismaMock as unknown as PrismaService,
      commandesServiceMock as any,
      notificationsServiceMock as any,
    );
  });

  afterEach(() => {
    __setMailSender(undefined);
  });

  describe('getPreFill', () => {
    it('returns pre-fill data with legal name and locked birthDate when present', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: USER_ID,
        name: 'Jean Dupont',
        firstName: 'Jean',
        lastName: 'Dupont',
        birthDate: new Date('1990-01-15T00:00:00.000Z'),
      });
      prismaMock.repairerFiscalDeclaration.findUnique.mockResolvedValue(null);

      const res = await service.getPreFill(USER_ID);

      expect(res.firstName).toBe('Jean');
      expect(res.lastName).toBe('Dupont');
      expect(res.legalName).toBe('Jean Dupont');
      expect(res.birthDate).toBe('1990-01-15T00:00:00.000Z');
      expect(res.isBirthDateLocked).toBe(true);
      expect(res.declaration).toBeNull();
    });

    it('returns isBirthDateLocked false when user has no birthDate', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: USER_ID,
        name: 'Jean Dupont',
        firstName: 'Jean',
        lastName: 'Dupont',
        birthDate: null,
      });
      prismaMock.repairerFiscalDeclaration.findUnique.mockResolvedValue(null);

      const res = await service.getPreFill(USER_ID);

      expect(res.birthDate).toBeNull();
      expect(res.isBirthDateLocked).toBe(false);
    });

    it('returns existing declaration if user already submitted', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: USER_ID,
        name: 'Jean Dupont',
        firstName: 'Jean',
        lastName: 'Dupont',
        birthDate: new Date('1990-01-15T00:00:00.000Z'),
      });
      prismaMock.repairerFiscalDeclaration.findUnique.mockResolvedValue({
        id: 'decl-1',
        userId: USER_ID,
        taxResidence: 'FR',
        addressLine: '10 avenue des Champs-Élysées',
        postalCode: '75008',
        city: 'Paris',
        country: 'FR',
        nif: '0123456789012',
        hasNoNif: false,
        birthCity: null,
        birthCountry: null,
        submittedAt: new Date('2026-10-15T12:00:00.000Z'),
      });

      const res = await service.getPreFill(USER_ID);
      expect(res.declaration).not.toBeNull();
      expect(res.declaration?.nif).toBe('0123456789012');
      expect(res.declaration?.city).toBe('Paris');
    });
  });

  describe('submitDeclaration', () => {
    it('saves declaration, stamps fiscalCompletedAt, and records audit logs', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: USER_ID,
        birthDate: null,
      });
      prismaMock.repairerFiscalDeclaration.findUnique.mockResolvedValue(null);
      prismaMock.repairerFiscalDeclaration.upsert.mockResolvedValue({
        id: 'decl-1',
        userId: USER_ID,
        taxResidence: 'FR',
        addressLine: '12 rue Victor Hugo',
        postalCode: '69002',
        city: 'Lyon',
        country: 'FR',
        nif: '1234567890123',
        hasNoNif: false,
        birthCity: null,
        birthCountry: null,
        submittedAt: new Date('2026-10-17T00:00:00.000Z'),
      });

      const input = {
        addressLine: '12 rue Victor Hugo',
        postalCode: '69002',
        city: 'Lyon',
        country: 'FR' as const,
        hasNoNif: false,
        nif: '1234567890123',
        birthDate: '1988-06-20',
        attestation: true as const,
      };

      await service.submitDeclaration(USER_ID, input);

      // User birthDate updated since it was missing
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID },
          data: expect.objectContaining({
            birthDate: expect.any(Date),
          }),
        }),
      );

      // RepairerProfile stamped via updateMany
      expect(prismaMock.repairerProfile.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID },
          data: expect.objectContaining({
            fiscalCompletedAt: expect.any(Date),
          }),
        }),
      );

      // The date of birth entered is logged on its own...
      expect(prismaMock.repairerFiscalAuditLog.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, fieldName: 'birthDate', oldValue: null, newValue: '1988-06-20' },
      });
      // ...and the first submission logs EVERY stored field as a change from nothing, not just a
      // marker: « initial_submission » alone proved a declaration existed, not what it said.
      const [{ data: initialRows }] = prismaMock.repairerFiscalAuditLog.createMany.mock.calls[0];
      expect(initialRows).toEqual(
        expect.arrayContaining([
          { userId: USER_ID, fieldName: 'declaration', oldValue: null, newValue: 'initial_submission' },
          { userId: USER_ID, fieldName: 'addressLine', oldValue: null, newValue: '12 rue Victor Hugo' },
          { userId: USER_ID, fieldName: 'nif', oldValue: null, newValue: '1234567890123' },
          { userId: USER_ID, fieldName: 'hasNoNif', oldValue: null, newValue: 'false' },
        ]),
      );
      // A field the declaration discards (no birth city when the NIF is given) is not logged as kept.
      expect(initialRows.map((r: { fieldName: string }) => r.fieldName)).not.toContain('birthCity');

      // Declaration upserted
      expect(prismaMock.repairerFiscalDeclaration.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID },
          create: expect.objectContaining({
            userId: USER_ID,
            nif: '1234567890123',
            hasNoNif: false,
          }),
          update: expect.objectContaining({
            nif: '1234567890123',
            hasNoNif: false,
          }),
        }),
      );
    });

    it('throws VALIDATION_ERROR if user has no DOB on record and none is provided', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: USER_ID,
        birthDate: null,
      });

      const input = {
        addressLine: '12 rue Victor Hugo',
        postalCode: '69002',
        city: 'Lyon',
        country: 'FR' as const,
        hasNoNif: false,
        nif: '1234567890123',
        attestation: true as const,
      };

      await expect(service.submitDeclaration(USER_ID, input)).rejects.toThrow(
        'La date de naissance est obligatoire',
      );
    });

    it('audits an update with the old AND the new value of every changed field, the NIF included', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: USER_ID,
        birthDate: new Date('1988-06-20T00:00:00.000Z'),
      });
      prismaMock.repairerFiscalDeclaration.findUnique.mockResolvedValue({
        id: 'decl-1',
        userId: USER_ID,
        taxResidence: 'FR',
        addressLine: 'Old Address',
        postalCode: '75001',
        city: 'Paris',
        country: 'FR',
        nif: '0123456789012',
        hasNoNif: false,
        birthCity: null,
        birthCountry: null,
        submittedAt: new Date('2026-10-10T00:00:00.000Z'),
      });

      await service.submitDeclaration(USER_ID, {
        addressLine: 'New Address',
        postalCode: '75001',
        city: 'Paris',
        country: 'FR' as const,
        hasNoNif: false,
        nif: '1987654321098',
        attestation: true as const,
      });

      // « Stocker chaque modification (ancienne valeur, nouvelle valeur) »: masking the NIF to its first
      // three and last four digits made a change to the middle six unprovable, so it is logged in full.
      const [{ data: rows }] = prismaMock.repairerFiscalAuditLog.createMany.mock.calls[0];
      expect(rows).toEqual([
        { userId: USER_ID, fieldName: 'addressLine', oldValue: 'Old Address', newValue: 'New Address' },
        { userId: USER_ID, fieldName: 'nif', oldValue: '0123456789012', newValue: '1987654321098' },
      ]);
    });

    it('rolls the whole declaration back when the user has no réparateur profile to stamp', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID, birthDate: new Date('1988-06-20T00:00:00.000Z') });
      prismaMock.repairerFiscalDeclaration.findUnique.mockResolvedValue(null);
      prismaMock.repairerProfile.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.submitDeclaration(USER_ID, {
          addressLine: '12 rue Victor Hugo',
          postalCode: '69002',
          city: 'Lyon',
          country: 'FR' as const,
          hasNoNif: false,
          nif: '1234567890123',
          attestation: true as const,
        }),
      ).rejects.toThrow('Activez');
      // The success the user would have been shown stamped nothing: nothing may be reported done.
      expect(commandesServiceMock.payoutStrandedCommandes).not.toHaveBeenCalled();
    });

    it('rejects a date of birth already on record that makes the user a minor', async () => {
      const yearsAgo = (n: number) => new Date(Date.now() - n * 365.25 * 86_400_000);
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID, birthDate: yearsAgo(16) });
      prismaMock.repairerFiscalDeclaration.findUnique.mockResolvedValue(null);

      await expect(
        service.submitDeclaration(USER_ID, {
          addressLine: '12 rue Victor Hugo',
          postalCode: '69002',
          city: 'Lyon',
          country: 'FR' as const,
          hasNoNif: false,
          nif: '1234567890123',
          attestation: true as const,
        }),
      ).rejects.toThrow('majeur');
      expect(prismaMock.repairerFiscalDeclaration.upsert).not.toHaveBeenCalled();
    });

    it('triggers payoutStrandedCommandes when declaration is submitted (CMP-D3)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: USER_ID,
        birthDate: new Date('1988-06-20T00:00:00.000Z'),
      });
      prismaMock.repairerFiscalDeclaration.findUnique.mockResolvedValue(null);
      prismaMock.repairerFiscalDeclaration.upsert.mockResolvedValue({ id: 'decl-1' });

      const input = {
        addressLine: '12 rue Victor Hugo',
        postalCode: '69002',
        city: 'Lyon',
        country: 'FR' as const,
        hasNoNif: false,
        nif: '1234567890123',
        attestation: true as const,
      };

      await service.submitDeclaration(USER_ID, input);

      expect(commandesServiceMock.payoutStrandedCommandes).toHaveBeenCalledWith(USER_ID);
    });
  });

  describe('sendFiscalReminders (CMP-D3)', () => {
    it('sends Relance 1 (email + push), updates reminder count and logs audit row', async () => {
      prismaMock.repairerProfile.findMany.mockResolvedValue([
        {
          id: 'prof-1',
          userId: 'user-1',
          fiscalReminderCount: 0,
          lastFiscalReminderAt: null,
          user: {
            id: 'user-1',
            email: 'repairer1@example.com',
            name: 'Alice Martin',
            firstName: 'Alice',
          },
        },
      ]);

      const res = await service.sendFiscalReminders();

      expect(res.reminded1).toBe(1);
      expect(res.reminded2).toBe(0);

      expect(sentMails).toHaveLength(1);
      expect(sentMails[0]).toEqual(
        expect.objectContaining({
          to: 'repairer1@example.com',
          subject: expect.stringContaining('Vos versements REVIME sont en attente'),
        }),
      );

      expect(prismaMock.repairerProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            kind: 'INDIVIDUAL',
            fiscalCompletedAt: null,
          }),
        }),
      );

      expect(notificationsServiceMock.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          mode: 'REPAIRER',
          type: 'FISCAL_DECLARATION_REQUIRED',
        }),
      );

      // The slot is CLAIMED on the count that was read, so two overlapping sweeps cannot both send.
      expect(prismaMock.repairerProfile.updateMany).toHaveBeenCalledWith({
        where: { id: 'prof-1', fiscalReminderCount: 0 },
        data: { fiscalReminderCount: 1, lastFiscalReminderAt: expect.any(Date) },
      });

      expect(prismaMock.repairerFiscalAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            fieldName: 'reminder',
            newValue: 'relance_1',
          }),
        }),
      );
    });

    it('sends Relance 2 when >= 7 days elapsed since Relance 1', async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      prismaMock.repairerProfile.findMany.mockResolvedValue([
        {
          id: 'prof-2',
          userId: 'user-2',
          fiscalReminderCount: 1,
          lastFiscalReminderAt: tenDaysAgo,
          user: {
            id: 'user-2',
            email: 'repairer2@example.com',
            name: 'Bob Smith',
            firstName: 'Bob',
          },
        },
      ]);

      const res = await service.sendFiscalReminders();

      expect(res.reminded1).toBe(0);
      expect(res.reminded2).toBe(1);

      expect(sentMails).toHaveLength(1);
      expect(sentMails[0]).toEqual(
        expect.objectContaining({
          to: 'repairer2@example.com',
          subject: expect.stringContaining('Dernier rappel : vos versements REVIME restent suspendus'),
        }),
      );

      expect(notificationsServiceMock.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-2',
          mode: 'REPAIRER',
          type: 'FISCAL_DECLARATION_REQUIRED',
        }),
      );

      expect(prismaMock.repairerProfile.updateMany).toHaveBeenCalledWith({
        where: { id: 'prof-2', fiscalReminderCount: 1 },
        data: { fiscalReminderCount: 2, lastFiscalReminderAt: expect.any(Date) },
      });

      expect(prismaMock.repairerFiscalAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-2',
            fieldName: 'reminder',
            oldValue: 'relance_1',
            newValue: 'relance_2_freeze_warning',
          }),
        }),
      );
    });

    it('skips candidate if < 7 days elapsed since Relance 1', async () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      prismaMock.repairerProfile.findMany.mockResolvedValue([
        {
          id: 'prof-3',
          userId: 'user-3',
          fiscalReminderCount: 1,
          lastFiscalReminderAt: twoDaysAgo,
          user: {
            id: 'user-3',
            email: 'repairer3@example.com',
            name: 'Charlie',
            firstName: 'Charlie',
          },
        },
      ]);

      const res = await service.sendFiscalReminders();

      expect(res.reminded1).toBe(0);
      expect(res.reminded2).toBe(0);
      expect(sentMails).toHaveLength(0);
      expect(notificationsServiceMock.emit).not.toHaveBeenCalled();
    });

    it('counts as frozen and does not re-remind when fiscalReminderCount >= 2', async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      prismaMock.repairerProfile.findMany.mockResolvedValue([
        {
          id: 'prof-4',
          userId: 'user-4',
          fiscalReminderCount: 2,
          lastFiscalReminderAt: tenDaysAgo,
          user: {
            id: 'user-4',
            email: 'repairer4@example.com',
            name: 'David',
            firstName: 'David',
          },
        },
      ]);

      const res = await service.sendFiscalReminders();

      expect(res.reminded1).toBe(0);
      expect(res.reminded2).toBe(0);
      expect(res.frozen).toBe(1);
      expect(sentMails).toHaveLength(0);
      expect(notificationsServiceMock.emit).not.toHaveBeenCalled();
    });

    const candidate = (over: Record<string, unknown> = {}) => ({
      id: 'prof-9',
      userId: 'user-9',
      fiscalReminderCount: 0,
      lastFiscalReminderAt: null,
      user: { id: 'user-9', email: 'repairer9@example.com', name: 'Eve', firstName: 'Eve' },
      ...over,
    });

    it('tells the truth: the payouts are already on hold, so no mail promises a future freeze', async () => {
      prismaMock.repairerProfile.findMany.mockResolvedValue([candidate()]);
      await service.sendFiscalReminders();
      prismaMock.repairerProfile.findMany.mockResolvedValue([
        candidate({ fiscalReminderCount: 1, lastFiscalReminderAt: new Date(Date.now() - 9 * 86_400_000) }),
      ]);
      await service.sendFiscalReminders();

      expect(sentMails).toHaveLength(2);
      for (const mail of sentMails) {
        expect(mail.text).toMatch(/aucun versement ne peut|restent suspendus/);
        expect(mail.text).not.toMatch(/seront (automatiquement )?gelés/);
        expect(mail.text).not.toMatch(/continuer à recevoir/);
      }
    });

    it('does not send when another sweep already claimed the slot', async () => {
      prismaMock.repairerProfile.findMany.mockResolvedValue([candidate()]);
      prismaMock.repairerProfile.updateMany.mockResolvedValueOnce({ count: 0 });

      const res = await service.sendFiscalReminders();

      expect(res.reminded1).toBe(0);
      expect(sentMails).toHaveLength(0);
      expect(notificationsServiceMock.emit).not.toHaveBeenCalled();
    });

    it('counts a reminder as sent when only the notification went out (the e-mail failed)', async () => {
      __setMailSender({
        send: async () => {
          throw new Error('smtp down');
        },
      });
      prismaMock.repairerProfile.findMany.mockResolvedValue([candidate()]);

      const res = await service.sendFiscalReminders();

      expect(res.reminded1).toBe(1);
      expect(res.failed).toBe(0);
    });

    it('gives the slot back and reports a failure when NEITHER channel went out', async () => {
      __setMailSender({
        send: async () => {
          throw new Error('smtp down');
        },
      });
      notificationsServiceMock.emit.mockRejectedValueOnce(new Error('db down'));
      prismaMock.repairerProfile.findMany.mockResolvedValue([candidate()]);

      const res = await service.sendFiscalReminders();

      expect(res.reminded1).toBe(0);
      expect(res.failed).toBe(1);
      // Recorded as sent but never received would have silenced the next run for a week.
      expect(prismaMock.repairerProfile.updateMany).toHaveBeenLastCalledWith({
        where: { id: 'prof-9', fiscalReminderCount: 1 },
        data: { fiscalReminderCount: 0, lastFiscalReminderAt: null },
      });
      expect(prismaMock.repairerFiscalAuditLog.create).not.toHaveBeenCalled();
    });

    it('one réparateur failing does not stop the others being reminded', async () => {
      prismaMock.repairerProfile.findMany.mockResolvedValue([
        candidate({ id: 'prof-a', user: { id: 'user-a', email: 'a@example.com', name: 'A', firstName: 'A' } }),
        candidate({ id: 'prof-b', user: { id: 'user-b', email: 'b@example.com', name: 'B', firstName: 'B' } }),
      ]);
      prismaMock.repairerProfile.updateMany.mockRejectedValueOnce(new Error('connection reset'));

      const res = await service.sendFiscalReminders();

      expect(res.failed).toBe(1);
      expect(res.reminded1).toBe(1);
      expect(sentMails.map((m) => m.to)).toEqual(['b@example.com']);
    });
  });
});
