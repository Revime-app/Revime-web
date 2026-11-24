import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FiscalService } from '../src/fiscal/fiscal.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { __setMailSender, type Mail } from '../src/mail/mail.service.js';
import { AppException } from '../src/common/app-exception.js';

/**
 * RU-29 / A1. The operator's « Relancer pour infos fiscales » button used to carry its own copy of the
 * reminder: a read-then-write count that two clicks could both win, mail and notification wording that
 * still promised « pour continuer à recevoir vos virements » (the sentence RU-27 removed from the
 * cron's copy because the payout is already held), a mail refusal swallowed as a success, and no look
 * at the golden rule's own definition of « complete » (an approved professional was reminded).
 * It now goes through the same claim, copy, delivery and audit as the cron's sweep.
 */
const NOW = new Date('2026-10-19T09:00:00Z');

type Row = {
  id: string;
  kind: 'INDIVIDUAL' | 'PRO';
  fiscalCompletedAt: Date | null;
  fiscalReminderCount: number;
  lastFiscalReminderAt: Date | null;
  user: {
    id: string;
    email: string;
    name: string;
    firstName: string | null;
    profile: { deletedAt: Date | null; verificationLevel: 'NONE' | 'IDENTITY' | 'BUSINESS' } | null;
    businessVerification: { status: 'PENDING' | 'APPROVED' | 'REJECTED' } | null;
  };
};

const row = (over: Partial<Row> = {}): Row => ({
  id: 'rp-1',
  kind: 'INDIVIDUAL',
  fiscalCompletedAt: null,
  fiscalReminderCount: 0,
  lastFiscalReminderAt: null,
  user: {
    id: 'u-1',
    email: 'camille@example.com',
    name: 'Camille Martin',
    firstName: 'Camille',
    profile: { deletedAt: null, verificationLevel: 'IDENTITY' },
    businessVerification: null,
  },
  ...over,
});

async function failure(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (e) {
    return e as AppException;
  }
  throw new Error('expected the call to be refused');
}

describe('FiscalService.remindOne (the operator\'s button)', () => {
  let prisma: {
    repairerProfile: { findUnique: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
    repairerFiscalAuditLog: { create: ReturnType<typeof vi.fn> };
  };
  let notifications: { emit: ReturnType<typeof vi.fn> };
  let service: FiscalService;
  let mails: { mail: Mail; strict: boolean | undefined }[];
  let mailRefused: boolean;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mails = [];
    mailRefused = false;
    __setMailSender({
      send: async (mail, options) => {
        // The real sender resolves on a provider refusal unless asked to be strict.
        if (mailRefused && options?.strict) throw new Error('validation_error: refused');
        mails.push({ mail, strict: options?.strict });
      },
    });
    prisma = {
      repairerProfile: {
        findUnique: vi.fn().mockResolvedValue(row()),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      repairerFiscalAuditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    notifications = { emit: vi.fn().mockResolvedValue(undefined) };
    service = new FiscalService(
      prisma as unknown as PrismaService,
      { payoutStrandedCommandes: vi.fn() } as never,
      notifications as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    __setMailSender(undefined);
  });

  it('refuses a user with no réparateur profile, and one whose account is deleted', async () => {
    prisma.repairerProfile.findUnique.mockResolvedValueOnce(null);
    expect((await failure(service.remindOne('u-1'))).code).toBe('UNPROCESSABLE_ENTITY');

    const deleted = row();
    deleted.user.profile = { deletedAt: new Date('2026-09-01'), verificationLevel: 'IDENTITY' };
    prisma.repairerProfile.findUnique.mockResolvedValueOnce(deleted);
    expect((await failure(service.remindOne('u-1'))).code).toBe('UNPROCESSABLE_ENTITY');
    expect(mails).toHaveLength(0);
  });

  it('refuses when the golden rule already calls the file complete: a declaration, or an approved professional', async () => {
    prisma.repairerProfile.findUnique.mockResolvedValueOnce(row({ fiscalCompletedAt: new Date('2026-09-01') }));
    expect((await failure(service.remindOne('u-1'))).code).toBe('UNPROCESSABLE_ENTITY');

    const pro = row({ kind: 'PRO' });
    pro.user.profile = { deletedAt: null, verificationLevel: 'BUSINESS' };
    pro.user.businessVerification = { status: 'APPROVED' };
    prisma.repairerProfile.findUnique.mockResolvedValueOnce(pro);
    expect((await failure(service.remindOne('u-1'))).code).toBe('UNPROCESSABLE_ENTITY');

    expect(prisma.repairerProfile.updateMany).not.toHaveBeenCalled();
    expect(mails).toHaveLength(0);
  });

  it('refuses a second reminder within 24 hours', async () => {
    prisma.repairerProfile.findUnique.mockResolvedValueOnce(
      row({ fiscalReminderCount: 1, lastFiscalReminderAt: new Date(NOW.getTime() - 2 * 3600_000) }),
    );
    expect((await failure(service.remindOne('u-1'))).code).toBe('TOO_MANY_REQUESTS');
    expect(prisma.repairerProfile.updateMany).not.toHaveBeenCalled();
  });

  it('claims the slot on the count it read, sends the cron\'s first reminder with strict delivery, and audits it', async () => {
    const out = await service.remindOne('u-1');

    expect(prisma.repairerProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'rp-1', fiscalReminderCount: 0 },
      data: { fiscalReminderCount: 1, lastFiscalReminderAt: NOW },
    });
    expect(mails).toHaveLength(1);
    expect(mails[0]!.strict).toBe(true);
    expect(mails[0]!.mail.to).toBe('camille@example.com');
    // The payout is ALREADY held: the wording must not promise a future freeze or « pour continuer à recevoir ».
    expect(mails[0]!.mail.text).toContain('aucun versement ne peut vous être effectué');
    expect(mails[0]!.mail.text).not.toContain('pour continuer à recevoir');
    expect(notifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-1', type: 'FISCAL_DECLARATION_REQUIRED' }),
    );
    expect(prisma.repairerFiscalAuditLog.create).toHaveBeenCalledWith({
      data: { userId: 'u-1', fieldName: 'reminder', oldValue: null, newValue: 'relance_1' },
    });
    expect(out).toEqual({ reminderCount: 1, lastReminderAt: NOW });
  });

  it('sends the last-reminder wording from the second reminder on, and keeps counting', async () => {
    prisma.repairerProfile.findUnique.mockResolvedValueOnce(
      row({ fiscalReminderCount: 2, lastFiscalReminderAt: new Date(NOW.getTime() - 3 * 86400_000) }),
    );
    const out = await service.remindOne('u-1');

    expect(mails[0]!.mail.text).toContain('dernier rappel');
    expect(prisma.repairerFiscalAuditLog.create).toHaveBeenCalledWith({
      data: { userId: 'u-1', fieldName: 'reminder', oldValue: 'relance_2_freeze_warning', newValue: 'relance_3' },
    });
    expect(out.reminderCount).toBe(3);
  });

  it('does not send when another click or the cron already took the slot', async () => {
    prisma.repairerProfile.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await failure(service.remindOne('u-1'))).code).toBe('CONFLICT');
    expect(mails).toHaveLength(0);
    expect(notifications.emit).not.toHaveBeenCalled();
    expect(prisma.repairerFiscalAuditLog.create).not.toHaveBeenCalled();
  });

  it('counts the reminder when the notification went out although the e-mail was refused', async () => {
    mailRefused = true;
    const out = await service.remindOne('u-1');
    expect(out.reminderCount).toBe(1);
    expect(prisma.repairerProfile.updateMany).toHaveBeenCalledTimes(1);
  });

  it('gives the slot back and says so when NEITHER channel went out', async () => {
    mailRefused = true;
    notifications.emit.mockRejectedValueOnce(new Error('push down'));

    expect((await failure(service.remindOne('u-1'))).code).toBe('SERVICE_UNAVAILABLE');

    expect(prisma.repairerProfile.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'rp-1', fiscalReminderCount: 1 },
      data: { fiscalReminderCount: 0, lastFiscalReminderAt: null },
    });
    expect(prisma.repairerFiscalAuditLog.create).not.toHaveBeenCalled();
  });
});
