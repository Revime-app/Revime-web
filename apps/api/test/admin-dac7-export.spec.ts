import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { adminExportPreviewResponseSchema, ROLE_PERMISSIONS, type AdminRole } from '@revime/shared';
import { AdminExportsService } from '../src/admin/admin-exports.service.js';
import { AdminExportsController } from '../src/admin/admin-exports.controller.js';
import { PERMISSION_KEY } from '../src/admin/require-permission.decorator.js';
import {
  DAC7_CSV_COLUMNS,
  buildDac7Row,
  dac7PaidCents,
  dac7RecapMail,
  type Dac7Order,
  type Dac7Repairer,
} from '../src/admin/dac7-report.js';

/**
 * CMP-D4 (RU-28 review). The fixtures have the shape the real query returns, field for field:
 * the first version of these specs mocked `connectAccount.maskedIban` and `repairer.birthCity`,
 * which do not exist in the schema, so the report passed its tests while printing an IBAN it had
 * made up from a Stripe account id.
 */
const NOW = new Date('2026-10-19T09:00:00.000Z');

function repairer(over: Record<string, unknown> = {}): Dac7Repairer {
  return {
    id: 'rep-1',
    email: 'camille@example.com',
    name: 'camille_fixe',
    firstName: 'Camille',
    lastName: 'Martin',
    birthDate: new Date('1995-03-14T00:00:00.000Z'),
    profile: { verificationLevel: 'IDENTITY' },
    repairerProfile: { kind: 'INDIVIDUAL', fiscalCompletedAt: new Date('2026-01-05T00:00:00.000Z') },
    fiscalDeclaration: {
      nif: '0123456789012',
      hasNoNif: false,
      addressLine: '42 Rue des Fleurs',
      postalCode: '69001',
      city: 'Lyon',
      birthCity: 'Lyon',
      birthCountry: 'FR',
    },
    businessVerification: null,
    connectAccount: { ibanLast4: '0412' },
    dac7Recaps: [],
    ...over,
  } as unknown as Dac7Repairer;
}

function order(over: Partial<Dac7Order> = {}): Dac7Order {
  return {
    repairerUserId: 'rep-1',
    repairCents: 10000,
    transferredCents: 10000,
    reversedCents: null,
    stripeTransferReversalId: null,
    transferredAt: new Date('2026-04-10T10:00:00.000Z'),
    releasedAt: new Date('2026-04-10T10:00:00.000Z'),
    ...over,
  };
}

const company = (over: Record<string, unknown> = {}) =>
  ({
    status: 'APPROVED',
    siren: '912345678',
    denomination: 'Atelier Phone Lyon',
    legalForm: 'SAS',
    establishmentAddress: '3 Quai Saint-Antoine, 69002 Lyon',
    ...over,
  }) as unknown;

describe('dac7PaidCents and buildDac7Row (CMP-D4)', () => {
  it('builds one row from the declaration: legal identity, NIF, birth, address, masked IBAN, quarters', () => {
    const row = buildDac7Row(
      repairer(),
      [
        order({ repairCents: 15000, transferredCents: 15000, transferredAt: new Date('2026-04-10T10:00:00.000Z') }),
        order({ repairCents: 5000, transferredCents: 5000, transferredAt: new Date('2026-11-02T10:00:00.000Z') }),
      ],
      2026,
    );

    // The LEGAL name, not the display name `camille_fixe`.
    expect(row.repairerName).toBe('Camille Martin');
    expect(row.status).toBe('Particulier');
    expect(row.identifier).toBe('0123456789012');
    expect(row.birthDate).toBe('14/03/1995');
    expect(row.birthCity).toBe('Lyon');
    expect(row.birthCountry).toBe('FR');
    expect(row.address).toBe('42 Rue des Fleurs, 69001 Lyon');
    expect(row.maskedIban).toBe('•••• 0412');
    expect(row.transactionsCount).toBe('2');
    expect(row.q1DisbursedEur).toBe('0,00 €');
    expect(row.q2DisbursedEur).toBe('150,00 €');
    expect(row.q3DisbursedEur).toBe('0,00 €');
    expect(row.q4DisbursedEur).toBe('50,00 €');
    expect(row.totalCents).toBe(20000);
    expect(row.feesRetainedEur).toBe('0,00 €');
    expect(row.isIncomplete).toBe(false);
    expect(row.recapStatus).toBe('En attente');
  });

  it('never invents an IBAN: no bank account known means no IBAN', () => {
    const row = buildDac7Row(repairer({ connectAccount: { ibanLast4: null, stripeAccountId: 'acct_1AbcDEF0412' } }), [order()], 2026);
    expect(row.maskedIban).toBe('—');
    expect(JSON.stringify(row)).not.toContain('FR76');
    expect(JSON.stringify(row)).not.toContain('0412');
  });

  it('dates money by the day it moved, not the day the order was released', () => {
    // Released on 30 December, held for an incomplete declaration, paid by the sweep on 3 January.
    const row = buildDac7Row(
      repairer(),
      [order({ releasedAt: new Date('2026-12-30T10:00:00.000Z'), transferredAt: new Date('2027-01-03T10:00:00.000Z') })],
      2027,
    );
    expect(row.q1DisbursedEur).toBe('100,00 €');
    expect(row.q4DisbursedEur).toBe('0,00 €');
  });

  it('falls back to the release date for a row older than the transferredAt column', () => {
    const row = buildDac7Row(
      repairer(),
      [order({ transferredAt: null, releasedAt: new Date('2026-08-01T10:00:00.000Z') })],
      2026,
    );
    expect(row.q3DisbursedEur).toBe('100,00 €');
  });

  it('counts what the réparateur kept: a clawed-back share is taken off, and a failed clawback is not', () => {
    expect(dac7PaidCents(order())).toBe(10000);
    expect(dac7PaidCents(order({ stripeTransferReversalId: 'trr_1', reversedCents: 4000 }))).toBe(6000);
    // A reversal with no recorded amount took the whole transfer back.
    expect(dac7PaidCents(order({ stripeTransferReversalId: 'trr_2', reversedCents: null }))).toBe(0);
    // `reversedCents` next to NO reversal id is a clawback that failed: the money stayed.
    expect(dac7PaidCents(order({ stripeTransferReversalId: null, reversedCents: 4000 }))).toBe(10000);
    // No recorded transfer amount: the quote is what was paid.
    expect(dac7PaidCents(order({ transferredCents: null, repairCents: 7000 }))).toBe(7000);
  });

  it('reports a company by its SIREN, with no date or place of birth, under its denomination', () => {
    const row = buildDac7Row(
      repairer({
        repairerProfile: { kind: 'PRO', fiscalCompletedAt: null },
        profile: { verificationLevel: 'BUSINESS' },
        fiscalDeclaration: null,
        businessVerification: company(),
      }),
      [order()],
      2026,
    );
    expect(row.status).toBe('Société');
    expect(row.repairerName).toBe('Atelier Phone Lyon');
    expect(row.identifier).toBe('912 345 678');
    expect(row.birthDate).toBe('—');
    expect(row.birthCity).toBe('—');
    expect(row.address).toBe('3 Quai Saint-Antoine, 69002 Lyon');
    expect(row.isIncomplete).toBe(false);
  });

  it('does not take the SIREN of a business nobody approved', () => {
    const row = buildDac7Row(
      repairer({
        repairerProfile: { kind: 'PRO', fiscalCompletedAt: null },
        profile: { verificationLevel: 'IDENTITY' },
        fiscalDeclaration: null,
        businessVerification: company({ status: 'PENDING' }),
      }),
      [order()],
      2026,
    );
    expect(row.status).toBe('Société');
    expect(row.identifier).toBe('Manquant');
    expect(row.isIncomplete).toBe(true);
    expect(row.recapStatus).toBe('Bloqué');
  });

  it('reports a sole trader as « Micro-entrepreneur », with a date of birth, and asks for it', () => {
    const base = {
      repairerProfile: { kind: 'PRO', fiscalCompletedAt: null },
      profile: { verificationLevel: 'BUSINESS' },
      fiscalDeclaration: null,
      businessVerification: company({ legalForm: 'Entrepreneur individuel', denomination: 'Hugo Leroy' }),
    };
    const withDate = buildDac7Row(repairer({ ...base, birthDate: new Date('1988-07-21T00:00:00.000Z') }), [order()], 2026);
    expect(withDate.status).toBe('Micro-entrepreneur');
    expect(withDate.birthDate).toBe('21/07/1988');
    expect(withDate.isIncomplete).toBe(false);

    const withoutDate = buildDac7Row(repairer({ ...base, birthDate: null }), [order()], 2026);
    expect(withoutDate.isIncomplete).toBe(true);
  });

  it('accepts « no NIF » only with a place of birth, and does not print the birthplace as a tax number', () => {
    const noNif = {
      nif: null,
      hasNoNif: true,
      addressLine: '1 Rue A',
      postalCode: '75001',
      city: 'Paris',
      birthCity: 'Paris',
      birthCountry: 'FR',
    };
    const ok = buildDac7Row(repairer({ fiscalDeclaration: noNif }), [order()], 2026);
    expect(ok.identifier).toBe('Sans NIF');
    expect(ok.isIncomplete).toBe(false);

    const noPlace = buildDac7Row(repairer({ fiscalDeclaration: { ...noNif, birthCity: null } }), [order()], 2026);
    expect(noPlace.isIncomplete).toBe(true);
  });

  it.each([
    ['no NIF and not « no NIF »', { fiscalDeclaration: { nif: null, hasNoNif: false, addressLine: '1 Rue A', postalCode: '75001', city: 'Paris', birthCity: 'Paris', birthCountry: 'FR' } }],
    ['no declaration at all (address, birth place and NIF missing)', { fiscalDeclaration: null }],
    ['no date of birth', { birthDate: null }],
    ['the payout gate says the fiscal step is not done', { repairerProfile: { kind: 'INDIVIDUAL', fiscalCompletedAt: null } }],
  ])('flags the dossier incomplete when %s', (_label, over) => {
    const row = buildDac7Row(repairer(over), [order()], 2026);
    expect(row.isIncomplete).toBe(true);
    expect(row.recapStatus).toBe('Bloqué');
  });

  it('asks for an address even when everything else is there', () => {
    const noAddress = {
      nif: '0123456789012',
      hasNoNif: false,
      addressLine: '',
      postalCode: '',
      city: '',
      birthCity: 'Lyon',
      birthCountry: 'FR',
    };
    const row = buildDac7Row(repairer({ fiscalDeclaration: noAddress }), [order()], 2026);
    expect(row.address).toBe('—');
    expect(row.isIncomplete).toBe(true);
  });

  it('keeps « Envoyé » over « Bloqué », and shows a failed send as « Échec »', () => {
    const sent = buildDac7Row(
      repairer({ fiscalDeclaration: null, dac7Recaps: [{ taxYear: 2026, status: 'SENT' }] }),
      [order()],
      2026,
    );
    expect(sent.recapStatus).toBe('Envoyé');

    const failed = buildDac7Row(repairer({ dac7Recaps: [{ taxYear: 2026, status: 'FAILED' }] }), [order()], 2026);
    expect(failed.recapStatus).toBe('Échec');

    // A recap of ANOTHER year says nothing about this one.
    const other = buildDac7Row(repairer({ dac7Recaps: [{ taxYear: 2025, status: 'SENT' }] }), [order()], 2026);
    expect(other.recapStatus).toBe('En attente');
  });

  it('escapes the réparateur name in the recap HTML and keeps it plain in the text part', () => {
    const row = buildDac7Row(repairer({ firstName: '<script>alert(1)</script>', lastName: 'O\'Neil & Fils' }), [order()], 2026);
    const mail = dac7RecapMail(row, 2026);
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; O&#39;Neil &amp; Fils');
    expect(mail.text).toContain("<script>alert(1)</script> O'Neil & Fils");
    expect(mail.subject).toBe('Récapitulatif annuel de vos revenus DAC7 (2026)');
    expect(mail.text).toContain('Total annuel perçu : 100,00 €');
  });
});

describe('AdminExportsService DAC7 (CMP-D4)', () => {
  let prisma: any;
  let auditService: any;
  let notifications: any;
  let mailer: any;
  let service: AdminExportsService;

  const dbOrder = (over: Record<string, unknown> = {}) => ({ ...order(), repairer: repairer(), ...over });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prisma = {
      commande: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      repairerDac7Recap: {
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    auditService = { record: vi.fn().mockResolvedValue(undefined) };
    notifications = { emit: vi.fn().mockResolvedValue(undefined) };
    mailer = { send: vi.fn().mockResolvedValue(undefined) };
    service = new AdminExportsService(prisma, auditService, notifications, mailer);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('buildDac7Report', () => {
    it('reads transfers dated in the year by the day they moved, and never filters on status', async () => {
      await service.buildDac7Report(2026);

      const args = prisma.commande.findMany.mock.calls[0][0];
      const inYear = { gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2026-12-31T23:59:59.999Z') };
      expect(args.where.stripeTransferId).toEqual({ not: null });
      expect(args.where.OR).toEqual([
        { transferredAt: inYear },
        { transferredAt: null, releasedAt: inYear },
      ]);
      // A REFUNDED order whose transfer was not reversed still paid the réparateur.
      expect(args.where.status).toBeUndefined();
      expect(args.include.repairer.include.dac7Recaps).toEqual({ where: { taxYear: 2026 } });
    });

    it('groups the orders of one réparateur into one row and drops an order clawed back in full', async () => {
      prisma.commande.findMany.mockResolvedValue([
        dbOrder(),
        dbOrder({ transferredAt: new Date('2026-07-01T10:00:00.000Z') }),
        dbOrder({ stripeTransferReversalId: 'trr_1', reversedCents: null }),
        dbOrder({
          repairerUserId: 'rep-2',
          stripeTransferReversalId: 'trr_2',
          reversedCents: 10000,
          repairer: repairer({ id: 'rep-2' }),
        }),
      ]);

      const rows = await service.buildDac7Report(2026);

      // rep-2 was paid and then fully reversed: not in the file. rep-1: two orders count, one was reversed.
      expect(rows).toHaveLength(1);
      expect(rows[0]!.repairerUserId).toBe('rep-1');
      expect(rows[0]!.ordersCount).toBe(2);
      expect(rows[0]!.totalCents).toBe(20000);
    });

    it('searches the réparateur by name, email, company name, SIREN or NIF', async () => {
      await service.buildDac7Report(2026, ' Martin ');
      const { where } = prisma.commande.findMany.mock.calls[0][0];
      expect(where.repairer.OR).toHaveLength(5);
      expect(JSON.stringify(where.repairer.OR)).toContain('Martin');
    });
  });

  describe('getExportPreview', () => {
    beforeEach(() => {
      vi.spyOn(service, 'getExportSummary').mockResolvedValue({
        totalOrdersCount: 0,
        totalGrossCents: 0,
        totalCommissionTtcCents: 0,
        totalCommissionHtCents: 0,
        totalVatCents: 0,
        totalPayoutsCents: 0,
        totalRefundsCents: 0,
        uniqueRepairersCount: 0,
      });
    });

    it('returns EVERY row, so the « dossiers incomplets » filter sees them all, and the incomplete count', async () => {
      prisma.commande.findMany.mockResolvedValue([
        dbOrder(),
        dbOrder({
          repairerUserId: 'rep-2',
          repairer: repairer({ id: 'rep-2', fiscalDeclaration: null }),
        }),
        dbOrder({ repairerUserId: 'rep-3', repairer: repairer({ id: 'rep-3' }) }),
      ]);

      const preview = await service.getExportPreview({ reportType: 'DAC7_ANNUAL', year: 2026, page: 1, limit: 1 });

      adminExportPreviewResponseSchema.parse(preview);
      expect(preview.previewRows).toHaveLength(3);
      expect(preview.totalRows).toBe(3);
      expect(preview.incompleteCount).toBe(1);
      expect(preview.columns.map((c) => c.key)).toEqual([
        'repairerName',
        'status',
        'identifier',
        'birthDate',
        'maskedIban',
        'transactionsCount',
        'q1DisbursedEur',
        'q2DisbursedEur',
        'q3DisbursedEur',
        'q4DisbursedEur',
        'feesRetainedEur',
        'recapStatus',
      ]);
    });

    it('is about the year that just ended when no year is asked for, whatever the period says', async () => {
      const preview = await service.getExportPreview({ reportType: 'DAC7_ANNUAL', period: 'this_month', page: 1, limit: 25 });

      expect(preview.periodLabel).toBe('Année 2025');
      const { where } = prisma.commande.findMany.mock.calls[0][0];
      expect(where.OR[0].transferredAt.gte).toEqual(new Date('2025-01-01T00:00:00.000Z'));
    });
  });

  describe('generateCsv', () => {
    it('writes the declaration: birth place and address are in the file, the recap tracking is not', async () => {
      prisma.commande.findMany.mockResolvedValue([dbOrder()]);

      const { filename, content } = await service.generateCsv({ reportType: 'DAC7_ANNUAL', year: 2026, page: 1, limit: 25 }, 'op-1');

      expect(filename).toBe('revime-export-DAC7-2026.csv');
      expect(content.startsWith('﻿')).toBe(true);
      const [header, line] = content.slice(1).split('\r\n');
      expect(header).toBe(
        'Réparateur,Statut,NIF / SIREN,Date de naissance,Lieu de naissance,Pays de naissance,Adresse,IBAN,Nb,T1,T2,T3,T4,Frais',
      );
      expect(line).toBe(
        'Camille Martin,Particulier,0123456789012,14/03/1995,Lyon,FR,"42 Rue des Fleurs, 69001 Lyon",•••• 0412,1,"0,00 €","100,00 €","0,00 €","0,00 €","0,00 €"',
      );
      expect(DAC7_CSV_COLUMNS.map((c) => c.key)).not.toContain('recapStatus');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'export.generate', actorUserId: 'op-1', detail: { reportType: 'DAC7_ANNUAL', recordCount: 1 } }),
      );
    });

    it('does not stop at 5 000 lines: a declaration file is complete or it is wrong', async () => {
      const many = Array.from({ length: 5100 }, (_, i) =>
        dbOrder({ repairerUserId: `rep-${i}`, repairer: repairer({ id: `rep-${i}` }) }),
      );
      prisma.commande.findMany.mockResolvedValue(many);

      const { content } = await service.generateCsv({ reportType: 'DAC7_ANNUAL', year: 2026, page: 1, limit: 25 });

      expect(content.trimEnd().split('\r\n')).toHaveLength(5101);
    });

    it('exports the calendar year even when asked with another period', async () => {
      const { filename } = await service.generateCsv({ reportType: 'DAC7_ANNUAL', period: 'this_month', page: 1, limit: 25 });

      expect(filename).toBe('revime-export-DAC7-2025.csv');
      const { where } = prisma.commande.findMany.mock.calls[0][0];
      expect(where.OR[0].transferredAt.gte).toEqual(new Date('2025-01-01T00:00:00.000Z'));
      expect(where.OR[0].transferredAt.lte).toEqual(new Date('2025-12-31T23:59:59.999Z'));
    });
  });

  describe('sendDac7Recaps', () => {
    const completeRepairer = (id: string, over: Record<string, unknown> = {}) =>
      dbOrder({ repairerUserId: id, repairer: repairer({ id, email: `${id}@example.com`, ...over }) });

    it('refuses a year that has not ended, and a future one', async () => {
      await expect(service.sendDac7Recaps(2026, 'op-1')).rejects.toMatchObject({ code: 'UNPROCESSABLE_ENTITY' });
      await expect(service.sendDac7Recaps(2027, 'op-1')).rejects.toMatchObject({ code: 'UNPROCESSABLE_ENTITY' });
      expect(prisma.commande.findMany).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('claims the row, emails with strict delivery, notifies, then records SENT with the real channel', async () => {
      prisma.commande.findMany.mockResolvedValue([
        completeRepairer('rep-1', { firstName: '<b>Alain</b>', lastName: 'Dupont' }),
      ]);

      const result = await service.sendDac7Recaps(2025, 'op-1');

      expect(result).toEqual({ sentCount: 1, blockedCount: 0, failedCount: 0, skippedCount: 0, totalCount: 1 });
      expect(prisma.repairerDac7Recap.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'rep-1', taxYear: 2025, status: 'SENDING', channel: 'NONE', totalCents: 10000, ordersCount: 1 }),
      });
      expect(mailer.send).toHaveBeenCalledTimes(1);
      const [mail, options] = mailer.send.mock.calls[0];
      expect(options).toEqual({ strict: true });
      expect(mail.to).toBe('rep-1@example.com');
      expect(mail.subject).toBe('Récapitulatif annuel de vos revenus DAC7 (2025)');
      expect(mail.html).toContain('&lt;b&gt;Alain&lt;/b&gt; Dupont');
      expect(notifications.emit).toHaveBeenCalledWith({
        userId: 'rep-1',
        mode: 'REPAIRER',
        type: 'DAC7_ANNUAL_RECAP_SENT',
        subject: '2025',
      });
      expect(prisma.repairerDac7Recap.update).toHaveBeenCalledWith({
        where: { userId_taxYear: { userId: 'rep-1', taxYear: 2025 } },
        data: { status: 'SENT', sentAt: expect.any(Date), channel: 'EMAIL_AND_INAPP' },
      });
    });

    it('never sends a recap again: an already-SENT réparateur is skipped without a mail', async () => {
      prisma.commande.findMany.mockResolvedValue([
        completeRepairer('rep-1', { dac7Recaps: [{ taxYear: 2025, status: 'SENT' }] }),
        completeRepairer('rep-2'),
      ]);

      const result = await service.sendDac7Recaps(2025, 'op-1');

      expect(result).toMatchObject({ sentCount: 1, skippedCount: 1, totalCount: 2 });
      expect(mailer.send).toHaveBeenCalledTimes(1);
      expect(mailer.send.mock.calls[0][0].to).toBe('rep-2@example.com');
    });

    it('does not send when another run holds the row, and takes over a BLOCKED, FAILED or stale one', async () => {
      prisma.commande.findMany.mockResolvedValue([completeRepairer('rep-1'), completeRepairer('rep-2')]);
      const duplicate = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      prisma.repairerDac7Recap.create.mockRejectedValue(duplicate);
      // rep-1: held by a live run (nothing claimable). rep-2: a FAILED row, claimed back.
      prisma.repairerDac7Recap.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

      const result = await service.sendDac7Recaps(2025, 'op-1');

      expect(result).toMatchObject({ sentCount: 1, skippedCount: 1 });
      expect(mailer.send).toHaveBeenCalledTimes(1);
      expect(mailer.send.mock.calls[0][0].to).toBe('rep-2@example.com');
      const claim = prisma.repairerDac7Recap.updateMany.mock.calls[0][0];
      expect(claim.where.userId).toBe('rep-1');
      expect(claim.where.OR[0]).toEqual({ status: { in: ['BLOCKED', 'FAILED'] } });
      // A claim nobody finished is retryable only after 15 minutes.
      expect(claim.where.OR[1].status).toBe('SENDING');
      expect(claim.where.OR[1].sentAt.lt).toEqual(new Date(NOW.getTime() - 15 * 60 * 1000));
    });

    it('records FAILED, and no SENT, when the provider refuses the email, and carries on with the others', async () => {
      prisma.commande.findMany.mockResolvedValue([completeRepairer('rep-1'), completeRepairer('rep-2')]);
      mailer.send.mockRejectedValueOnce(new Error('validation_error: invalid recipient')).mockResolvedValueOnce(undefined);

      const result = await service.sendDac7Recaps(2025, 'op-1');

      expect(result).toMatchObject({ sentCount: 1, failedCount: 1 });
      expect(prisma.repairerDac7Recap.update).toHaveBeenCalledWith({
        where: { userId_taxYear: { userId: 'rep-1', taxYear: 2025 } },
        data: { status: 'FAILED', channel: 'NONE' },
      });
      expect(prisma.repairerDac7Recap.update).toHaveBeenCalledWith({
        where: { userId_taxYear: { userId: 'rep-2', taxYear: 2025 } },
        data: expect.objectContaining({ status: 'SENT' }),
      });
      // No in-app « your recap is available » for an email that never left.
      expect(notifications.emit).toHaveBeenCalledTimes(1);
      expect(notifications.emit).toHaveBeenCalledWith(expect.objectContaining({ userId: 'rep-2' }));
    });

    it('records FAILED for a réparateur with no email address instead of calling him sent', async () => {
      prisma.commande.findMany.mockResolvedValue([completeRepairer('rep-1', { email: '' })]);

      const result = await service.sendDac7Recaps(2025, 'op-1');

      expect(result).toMatchObject({ sentCount: 0, failedCount: 1 });
      expect(mailer.send).not.toHaveBeenCalled();
      expect(prisma.repairerDac7Recap.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'FAILED', channel: 'NONE' } }));
    });

    it('still records SENT, over the email channel only, when just the in-app notice fails', async () => {
      prisma.commande.findMany.mockResolvedValue([completeRepairer('rep-1')]);
      notifications.emit.mockRejectedValue(new Error('push down'));

      const result = await service.sendDac7Recaps(2025, 'op-1');

      expect(result.sentCount).toBe(1);
      expect(prisma.repairerDac7Recap.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SENT', channel: 'EMAIL' }) }),
      );
    });

    it('says EMAIL, not EMAIL_AND_INAPP, when there is no notification service to point at the email', async () => {
      const bare = new AdminExportsService(prisma, auditService, undefined, mailer);
      prisma.commande.findMany.mockResolvedValue([completeRepairer('rep-1')]);

      await bare.sendDac7Recaps(2025, 'op-1');

      expect(prisma.repairerDac7Recap.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SENT', channel: 'EMAIL' }) }),
      );
    });

    it('records an incomplete dossier as BLOCKED with no email, no notification and no channel', async () => {
      prisma.commande.findMany.mockResolvedValue([completeRepairer('rep-1', { fiscalDeclaration: null })]);

      const result = await service.sendDac7Recaps(2025, 'op-1');

      expect(result).toMatchObject({ sentCount: 0, blockedCount: 1 });
      expect(prisma.repairerDac7Recap.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'rep-1', status: 'BLOCKED', channel: 'NONE' }),
      });
      expect(mailer.send).not.toHaveBeenCalled();
      expect(notifications.emit).not.toHaveBeenCalled();
    });

    it('counts a réparateur whose database write blows up as failed, without stopping the run', async () => {
      prisma.commande.findMany.mockResolvedValue([completeRepairer('rep-1'), completeRepairer('rep-2')]);
      prisma.repairerDac7Recap.create.mockRejectedValueOnce(new Error('connection reset')).mockResolvedValueOnce({});

      const result = await service.sendDac7Recaps(2025, 'op-1');

      expect(result).toMatchObject({ sentCount: 1, failedCount: 1, totalCount: 2 });
    });

    it('works through the réparateurs five at a time', async () => {
      prisma.commande.findMany.mockResolvedValue(Array.from({ length: 12 }, (_, i) => completeRepairer(`rep-${i}`)));
      let inFlight = 0;
      let peak = 0;
      mailer.send.mockImplementation(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await Promise.resolve();
        inFlight--;
      });

      const result = await service.sendDac7Recaps(2025, 'op-1');

      expect(result.sentCount).toBe(12);
      expect(peak).toBe(5);
    });

    it('audits the run with every count and the operator', async () => {
      prisma.commande.findMany.mockResolvedValue([completeRepairer('rep-1'), completeRepairer('rep-2', { fiscalDeclaration: null })]);

      await service.sendDac7Recaps(2025, 'op-1');

      expect(auditService.record).toHaveBeenCalledWith({
        actorUserId: 'op-1',
        actorEmail: null,
        action: 'export.dac7_send_recaps',
        targetType: 'AccountingExport',
        targetId: '2025',
        statusCode: 200,
        detail: { sentCount: 1, blockedCount: 1, failedCount: 0, skippedCount: 0, totalCount: 2 },
      });
    });
  });
});

describe('AdminExportsController DAC7 (CMP-D4)', () => {
  let service: any;
  let controller: AdminExportsController;
  const session = (role: AdminRole | null) => ({ user: { id: 'u-1', role } }) as any;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    service = {
      getExportPreview: vi.fn().mockResolvedValue({}),
      generateCsv: vi.fn().mockResolvedValue({ filename: 'f.csv', content: '' }),
      sendDac7Recaps: vi.fn().mockResolvedValue({ sentCount: 1, blockedCount: 0, failedCount: 0, skippedCount: 0, totalCount: 1 }),
    };
    controller = new AdminExportsController(service);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const roles = Object.keys(ROLE_PERMISSIONS) as AdminRole[];
  const mayReadDac7 = (role: AdminRole) => ROLE_PERMISSIONS[role].includes('payments.manage');

  it.each(roles)('%s: previews and downloads the DAC7 file only with payments.manage', async (role) => {
    const res = { setHeader: vi.fn(), send: vi.fn() } as any;
    const asks = [
      async () => controller.exportPreview({ reportType: 'DAC7_ANNUAL', year: '2025' }, session(role)),
      async () => controller.exportDownload({ reportType: 'DAC7_ANNUAL', year: '2025' }, res, session(role)),
    ];
    for (const ask of asks) {
      if (mayReadDac7(role)) await expect(ask()).resolves.not.toThrow();
      else await expect(ask()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    if (!mayReadDac7(role)) {
      expect(service.getExportPreview).not.toHaveBeenCalled();
      expect(service.generateCsv).not.toHaveBeenCalled();
    }
  });

  it('leaves the four other reports to every role that can read the dashboard', async () => {
    await expect(controller.exportPreview({ reportType: 'PAYOUTS' }, session('read_only'))).resolves.toBeDefined();
    expect(service.getExportPreview).toHaveBeenCalledTimes(1);
  });

  it('refuses a session with no role (a malformed role is not a permission)', async () => {
    await expect(async () =>
      controller.exportPreview({ reportType: 'DAC7_ANNUAL' }, { user: { id: 'u-1', role: ['admin'] } } as any),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('sends recaps under payments.manage, not users.moderate', () => {
    expect(Reflect.getMetadata(PERMISSION_KEY, AdminExportsController.prototype.sendDac7Recaps)).toBe('payments.manage');
    expect(ROLE_PERMISSIONS.finance).toContain('payments.manage');
    expect(ROLE_PERMISSIONS.moderation).not.toContain('payments.manage');
  });

  it('passes the parsed year and the operator to the service', async () => {
    const res = await controller.sendDac7Recaps(session('finance'), { year: '2025' });

    expect(service.sendDac7Recaps).toHaveBeenCalledWith(2025, 'u-1');
    expect(res.sentCount).toBe(1);
  });

  it('defaults to the year that just ended', async () => {
    await controller.sendDac7Recaps(session('finance'), {});

    expect(service.sendDac7Recaps).toHaveBeenCalledWith(2025, 'u-1');
  });

  it.each([['abc'], ['2024'], ['2025.5'], ['2051'], ['']])('rejects the year %j before anything is sent', async (year) => {
    await expect(async () => controller.sendDac7Recaps(session('finance'), { year })).rejects.toThrow();
    expect(service.sendDac7Recaps).not.toHaveBeenCalled();
  });
});
