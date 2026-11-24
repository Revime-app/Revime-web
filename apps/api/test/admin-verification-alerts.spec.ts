import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminVerificationAlertTypeSchema } from '@revime/shared';
import {
  AdminVerificationsService,
  ALERT_USER_SELECT,
  type AlertUser,
} from '../src/admin/admin-verifications.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * A3. Fixtures are typed from the select the service really runs (`AlertUser`), so a fixture that
 * carries a column the query does not read, or the schema does not have, no longer compiles. The first
 * version of this spec supplied `enteredBirthDate`, `stripeBirthDate`, `maskedIban` and an `ibanLast4`
 * the query never selected, so two alerts « passed » that could never fire in production (RU-29).
 */
const NOW = new Date('2026-10-19T09:00:00Z');

function user(over: Partial<AlertUser> & Pick<AlertUser, 'id' | 'name'>): AlertUser {
  return {
    firstName: null,
    lastName: null,
    birthDate: new Date('2003-05-10T12:00:00Z'),
    repairerProfile: { kind: 'INDIVIDUAL' },
    fiscalDeclaration: null,
    businessVerification: null,
    connectAccount: null,
    ...over,
  };
}

const account = (ibanLast4: string | null, ibanFingerprint: string | null) => ({ ibanLast4, ibanFingerprint });
const declaration = (nif: string | null, hasNoNif = false) => ({ nif, hasNoNif });

describe('A-3: AdminVerificationsService.getAlerts', () => {
  let prisma: {
    user: { findMany: ReturnType<typeof vi.fn> };
    commande: { findMany: ReturnType<typeof vi.fn> };
  };
  let service: AdminVerificationsService;

  const run = (users: AlertUser[]) => {
    prisma.user.findMany.mockResolvedValue(users);
    return service.getAlerts();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prisma = {
      user: { findMany: vi.fn().mockResolvedValue([]) },
      commande: { findMany: vi.fn().mockResolvedValue([]) },
    };
    service = new AdminVerificationsService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads only columns that exist, and the bank fingerprint rather than the four digits alone', async () => {
    await run([]);
    const args = prisma.user.findMany.mock.calls[0]![0] as { select: typeof ALERT_USER_SELECT };
    expect(args.select).toBe(ALERT_USER_SELECT);
    expect(ALERT_USER_SELECT.connectAccount).toEqual({ select: { ibanLast4: true, ibanFingerprint: true } });
    expect(ALERT_USER_SELECT).not.toHaveProperty('identityVerification');
  });

  it('returns no alert when nobody triggers a rule, and does not look at orders without an individual', async () => {
    const res = await run([
      user({
        id: 'ok',
        name: 'Claire Dupont',
        repairerProfile: { kind: 'PRO' },
        fiscalDeclaration: declaration('0123456789012'),
        connectAccount: account('1234', 'fp-1'),
      }),
    ]);
    expect(res).toEqual({ alerts: [], totalCount: 0 });
    expect(prisma.commande.findMany).not.toHaveBeenCalled();
  });

  it('has no « différent de Stripe Identity » alert: nothing here reads Stripe Identity\'s name or date of birth', () => {
    expect(adminVerificationAlertTypeSchema.options).not.toContain('STRIPE_IDENTITY_MISMATCH');
  });

  it('detects MALFORMED_NIF with the mockup\'s wording', async () => {
    const res = await run([user({ id: 'usr-jordan', name: 'Jordan B.', fiscalDeclaration: declaration('12345') })]);
    expect(res.alerts).toEqual([
      {
        id: 'malformed-nif-usr-jordan',
        type: 'MALFORMED_NIF',
        severity: 'CRITICAL',
        title: 'NIF mal formé · Jordan B.',
        detail: '« 12345 » : 13 chiffres attendus, commençant par 0, 1, 2 ou 3.',
        userId: 'usr-jordan',
        userName: 'Jordan B.',
        userHref: '/utilisateurs/usr-jordan',
      },
    ]);
  });

  describe('DUPLICATE_IBAN', () => {
    it('fires when two accounts share Stripe\'s bank-account fingerprint, and shows only the last four', async () => {
      const res = await run([
        user({ id: 'l1', name: 'Lucas D.', connectAccount: account('7781', 'fp-shared') }),
        user({ id: 'l2', name: 'Lucas Dubois', connectAccount: account('7781', 'fp-shared') }),
      ]);
      expect(res.alerts).toHaveLength(1);
      const alert = res.alerts[0]!;
      expect(alert.type).toBe('DUPLICATE_IBAN');
      expect(alert.severity).toBe('CRITICAL');
      expect(alert.title).toBe('Même IBAN sur 2 comptes · Lucas D. et Lucas Dubois');
      expect(alert.detail).toBe('•••• 7781 utilisé par deux réparateurs.');
    });

    it('does NOT fire on the same last four digits alone: four digits are not an IBAN', async () => {
      const res = await run([
        user({ id: 'a', name: 'A', connectAccount: account('7781', 'fp-a') }),
        user({ id: 'b', name: 'B', connectAccount: account('7781', 'fp-b') }),
      ]);
      expect(res.alerts).toEqual([]);
    });

    it('does not group accounts that have not synced a bank account yet', async () => {
      const res = await run([
        user({ id: 'a', name: 'A', connectAccount: account(null, null) }),
        user({ id: 'b', name: 'B', connectAccount: account(null, null) }),
        user({ id: 'c', name: 'C', connectAccount: null }),
      ]);
      expect(res.alerts).toEqual([]);
    });

    it('counts three accounts', async () => {
      const res = await run(
        ['a', 'b', 'c'].map((id) => user({ id, name: id.toUpperCase(), connectAccount: account('0001', 'fp') })),
      );
      expect(res.alerts[0]!.title).toBe('Même IBAN sur 3 comptes · A, B et C');
      expect(res.alerts[0]!.detail).toBe('•••• 0001 utilisé par 3 réparateurs.');
    });
  });

  it('detects DUPLICATE_NIF without printing the tax number: the alert is read by every staff role', async () => {
    const res = await run([
      user({ id: 'n1', name: 'Nora', fiscalDeclaration: declaration('0123456789012') }),
      user({ id: 'n2', name: 'Nadia', fiscalDeclaration: declaration('0123 456 789 012') }),
    ]);
    expect(res.alerts).toHaveLength(1);
    const alert = res.alerts[0]!;
    expect(alert.type).toBe('DUPLICATE_NIF');
    expect(alert.title).toBe('Même NIF sur 2 comptes · Nora et Nadia');
    expect(alert.detail).toBe('NIF « •••• 012 » utilisé par deux réparateurs.');
    expect(JSON.stringify(res)).not.toContain('0123456789012');
  });

  describe('NO_NIF_OVER_25', () => {
    it('fires for a person more than 25 years old, on the birthday and not a day before', async () => {
      const res = await run([
        user({ id: 'old', name: 'Karim T.', birthDate: new Date('2000-10-19T12:00:00Z'), fiscalDeclaration: declaration(null, true) }),
        user({ id: 'young', name: 'Léa', birthDate: new Date('2000-10-20T12:00:00Z'), fiscalDeclaration: declaration(null, true) }),
      ]);
      expect(res.alerts).toHaveLength(1);
      expect(res.alerts[0]!.title).toBe('« Pas de NIF » coché, 26 ans · Karim T.');
      expect(res.alerts[0]!.detail).toBe('À vérifier : demander un justificatif.');
      expect(res.alerts[0]!.severity).toBe('WARNING');
    });

    it('reads the birthday in UTC, the way the date is stored, whatever the server\'s zone', async () => {
      // 2000-10-19T23:30Z is still the 19th in UTC, the 20th in Paris: the person turned 26 today.
      const res = await run([
        user({ id: 'edge', name: 'Edge', birthDate: new Date('2000-10-19T23:30:00Z'), fiscalDeclaration: declaration(null, true) }),
      ]);
      expect(res.alerts).toHaveLength(1);
    });
  });

  describe('PARTICULAR_QUOTA_80_PERCENT', () => {
    it('counts the same orders as the user page (one definition) and fires at 8 missions', async () => {
      prisma.commande.findMany.mockResolvedValue(
        [15000, 12000, 20000, 15000, 14000, 13000, 10000, 15000].map((repairCents) => ({
          repairerUserId: 'usr-camille',
          repairCents,
          refundRepairCents: null,
          paidAt: new Date('2026-05-01T10:00:00Z'),
        })),
      );
      const res = await run([
        user({ id: 'usr-camille', name: 'Camille Martin' }),
        user({ id: 'usr-pro', name: 'Pro', repairerProfile: { kind: 'PRO' } }),
      ]);

      expect(prisma.commande.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            repairerUserId: { in: ['usr-camille'] },
            status: 'PAID',
            stripeRefundId: null,
            paidAt: { gte: new Date('2025-10-19T09:00:00Z') },
          },
        }),
      );
      expect(res.alerts).toHaveLength(1);
      const alert = res.alerts[0]!;
      expect(alert.type).toBe('PARTICULAR_QUOTA_80_PERCENT');
      expect(alert.title).toBe('80 % du plafond particulier · Camille Martin');
      expect(alert.detail).toBe('8 missions et 1 140 € sur 12 mois.');
    });

    it('nets what a partial refund gave back and stays quiet below both thresholds', async () => {
      prisma.commande.findMany.mockResolvedValue([
        { repairerUserId: 'u', repairCents: 130000, refundRepairCents: 30000, paidAt: new Date('2026-05-01T10:00:00Z') },
      ]);
      expect((await run([user({ id: 'u', name: 'U' })])).alerts).toEqual([]);
    });

    it('fires on 1 200 euros collected in one mission', async () => {
      prisma.commande.findMany.mockResolvedValue([
        { repairerUserId: 'u', repairCents: 120000, refundRepairCents: null, paidAt: new Date('2026-05-01T10:00:00Z') },
      ]);
      const res = await run([user({ id: 'u', name: 'U' })]);
      expect(res.alerts[0]!.detail).toBe('1 mission et 1 200 € sur 12 mois.');
    });
  });

  it('detects SIRET_MISMATCH (B4 integration)', async () => {
    const res = await run([
      user({
        id: 'usr-malek',
        name: 'Malek K.',
        repairerProfile: { kind: 'PRO' },
        businessVerification: {
          siret: '80835976400020',
          siren: '808359764',
          denomination: 'Klimane Reparation',
          registrationProofName: 'Avis_situation_97923317800040.pdf',
        },
      }),
    ]);
    expect(res.alerts).toHaveLength(1);
    const alert = res.alerts[0]!;
    expect(alert.type).toBe('SIRET_MISMATCH');
    expect(alert.severity).toBe('CRITICAL');
    expect(alert.title).toBe('Discordance SIRET justificatif · Klimane Reparation');
    expect(alert.detail).toContain('80835976400020');
    expect(alert.detail).toContain('97923317800040');
  });
});
