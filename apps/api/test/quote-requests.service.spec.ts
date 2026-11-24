import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateQuoteRequestInput, DemandeDto } from '@revime/shared';
import { Prisma } from '../src/generated/prisma/client.js';
import { QuoteRequestsService } from '../src/quote-requests/quote-requests.service.js';
import type { DemandesService } from '../src/demandes/demandes.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import { withUserLookups } from './support/review-seal.js';

/** CF4-25 (spec §4.2 « Routes (new) »). Send and list private quote requests. */

const CLIENT = 'client-1';
const TARGET = 'repairer-1';

const input: CreateQuoteRequestInput = {
  categoryId: '11111111-1111-4111-8111-111111111111',
  title: 'Écran cassé',
  description: 'Mon écran est fissuré depuis une chute.',
  parts: 'UNKNOWN',
  mode: 'OFFERS',
  locationLabel: 'Lyon',
  postalCode: '69001',
  photoPaths: [],
  preferredTravel: 'HOME',
  details: 'Disponible le soir.',
};

type Target = {
  deletedAt: Date | null;
  repairerEnabled: boolean;
  repairerSuspendedAt: Date | null;
  verificationLevel: string;
} | null;

function harness(opts: { target?: Target; kind?: 'PRO' | 'INDIVIDUAL'; createError?: unknown } = {}) {
  const target: Target =
    opts.target === undefined
      ? { deletedAt: null, repairerEnabled: true, repairerSuspendedAt: null, verificationLevel: 'IDENTITY' }
      : opts.target;
  const prisma = {
    profile: {
      findFirst: vi.fn(async (args: { where: { userId: string } }) =>
        args.where.userId === TARGET ? target : { verificationLevel: 'BASIC' },
      ),
    },
    repairerProfile: { findUnique: vi.fn().mockResolvedValue({ kind: opts.kind ?? 'INDIVIDUAL' }) },
    user: { findFirst: vi.fn().mockResolvedValue({ username: 'julie' }) },
    demande: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const dto = { id: 'd1', title: input.title } as DemandeDto;
  const create = vi.fn(async () => {
    if (opts.createError) throw opts.createError;
    return dto;
  });
  const demandes = { create } as unknown as DemandesService;
  const emit = vi.fn().mockResolvedValue(undefined);
  const notifications = { emit } as unknown as NotificationsService;
  const service = new QuoteRequestsService(withUserLookups(prisma) as unknown as PrismaService, demandes, notifications);
  return { service, prisma, create, emit, dto };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-30T10:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

describe('QuoteRequestsService.create', () => {
  it('refuses a request to yourself', async () => {
    const { service, create } = harness();
    await expect(service.create(TARGET, TARGET, input)).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: 'Vous ne pouvez pas vous demander un devis.',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown', null],
    ['deleted', { deletedAt: new Date(), repairerEnabled: true, repairerSuspendedAt: null, verificationLevel: 'IDENTITY' }],
    ['not in réparateur mode', { deletedAt: null, repairerEnabled: false, repairerSuspendedAt: null, verificationLevel: 'IDENTITY' }],
    ['suspended', { deletedAt: null, repairerEnabled: true, repairerSuspendedAt: new Date(), verificationLevel: 'IDENTITY' }],
  ] as const)('refuses a target that is %s', async (_label, target) => {
    const { service, create } = harness({ target: target as Target });
    await expect(service.create(CLIENT, TARGET, input)).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: 'Ce réparateur ne reçoit pas de demandes de devis.',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a target below IDENTITY', async () => {
    const { service, create } = harness({
      target: { deletedAt: null, repairerEnabled: true, repairerSuspendedAt: null, verificationLevel: 'BASIC' },
    });
    await expect(service.create(CLIENT, TARGET, input)).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: 'Ce réparateur ne peut pas encore envoyer de devis.',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a PRO target below BUSINESS (the offer gate rule)', async () => {
    const { service } = harness({ kind: 'PRO' });
    await expect(service.create(CLIENT, TARGET, input)).rejects.toThrow(
      'Ce réparateur ne peut pas encore envoyer de devis.',
    );
  });

  it('maps the H6 partial unique (P2002) to 409', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
    const { service, emit } = harness({ createError: p2002 });
    await expect(service.create(CLIENT, TARGET, input)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Vous avez déjà une demande de devis en cours auprès de ce réparateur.',
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it('creates through DemandesService.create with the private fields and a 7-day expiry', async () => {
    const { service, create, dto } = harness();
    const result = await service.create(CLIENT, TARGET, input);
    expect(result).toBe(dto);
    expect(create).toHaveBeenCalledTimes(1);
    const [userId, demandeInput, quote] = create.mock.calls[0] as unknown as [string, unknown, Record<string, unknown>];
    expect(userId).toBe(CLIENT);
    // The public demande fields only - the two quote fields travel in the third argument.
    expect(demandeInput).not.toHaveProperty('preferredTravel');
    expect(demandeInput).not.toHaveProperty('details');
    expect(demandeInput).toMatchObject({ title: input.title, photoPaths: [] });
    expect(quote).toEqual({
      targetRepairerUserId: TARGET,
      quoteExpiresAt: new Date('2026-10-07T10:00:00.000Z'),
      quotePreferredTravel: 'HOME',
      quoteDetails: 'Disponible le soir.',
    });
  });

  it('absent optional fields are stored as null', async () => {
    const { service, create } = harness();
    const { preferredTravel: _p, details: _d, ...bare } = input;
    await service.create(CLIENT, TARGET, bare as CreateQuoteRequestInput);
    const quote = (create.mock.calls[0] as unknown as unknown[])[2] as Record<string, unknown>;
    expect(quote.quotePreferredTravel).toBeNull();
    expect(quote.quoteDetails).toBeNull();
  });

  it('notifies the target with the client handle and the title', async () => {
    const { service, emit } = harness();
    await service.create(CLIENT, TARGET, input);
    expect(emit).toHaveBeenCalledWith({
      userId: TARGET,
      mode: 'REPAIRER',
      type: 'QUOTE_REQUESTED',
      actorName: 'julie',
      subject: 'Écran cassé',
      demandeId: 'd1',
    });
  });
});

describe('QuoteRequestsService.listForRepairer', () => {
  const row = (id: string, status: string, createdAt: string, offers: { id: string; priceCents: number }[] = []) => ({
    id,
    title: `T ${id}`,
    status,
    quoteExpiresAt: status === 'OPEN' ? new Date('2026-10-07T10:00:00Z') : null,
    quoteClosedReason: status === 'CANCELLED' ? 'DECLINED' : null,
    createdAt: new Date(createdAt),
    author: { username: 'julie' },
    offers,
  });

  it('is scoped to requests addressed to him, visible only', async () => {
    const { service, prisma } = harness();
    await service.listForRepairer(TARGET);
    const where = prisma.demande.findMany.mock.calls[0]![0].where;
    expect(where).toEqual({ targetRepairerUserId: TARGET, deletedAt: null, hiddenAt: null });
    // His own live quote only.
    const select = prisma.demande.findMany.mock.calls[0]![0].select;
    expect(select.offers.where).toEqual({ repairerUserId: TARGET, status: 'SENT', deletedAt: null });
  });

  it('puts OPEN first, then newest, and maps the live quote', async () => {
    const { service, prisma } = harness();
    prisma.demande.findMany.mockResolvedValue([
      // Already newest-first, as the query orders them.
      row('closed-new', 'CANCELLED', '2026-09-29T10:00:00Z'),
      row('open-mid', 'OPEN', '2026-09-28T10:00:00Z', [{ id: 'o1', priceCents: 4500 }]),
      row('done-old', 'DONE', '2026-09-20T10:00:00Z'),
      row('open-old', 'OPEN', '2026-09-10T10:00:00Z'),
    ]);
    const items = await service.listForRepairer(TARGET);
    expect(items.map((i) => i.demandeId)).toEqual(['open-mid', 'open-old', 'closed-new', 'done-old']);
    expect(items[0]).toEqual({
      demandeId: 'open-mid',
      title: 'T open-mid',
      clientName: 'julie',
      status: 'OPEN',
      expiresAt: '2026-10-07T10:00:00.000Z',
      closedReason: null,
      liveQuote: { offerId: 'o1', priceCents: 4500 },
      createdAt: '2026-09-28T10:00:00.000Z',
    });
    expect(items[1]!.liveQuote).toBeNull();
    expect(items[2]!.closedReason).toBe('DECLINED');
  });
});
