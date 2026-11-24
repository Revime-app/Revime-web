import { describe, expect, it, vi } from 'vitest';
import { AdminIdentityDecisionsService } from '../src/admin/admin-identity-decisions.service.js';
import { AppException } from '../src/common/app-exception.js';

/**
 * CF4-39 (sub-project M, spec §4.4). Accept / refuse / request new documents on a réparateur's
 * identity check. Prisma mocked; `$transaction` runs the callback against `tx`.
 *
 * Review Focus 4: every row write is conditional on the `decision` read, so a double-click or a
 * second operator gets CONFLICT and overwrites nothing (motif, author, date).
 */

const ACTOR = 'admin-1';
const USER = 'user-1';

type Decision = 'ACCEPTED' | 'REFUSED' | 'DOCUMENTS_REQUESTED' | null;
type Status = 'REQUIRES_INPUT' | 'PROCESSING' | 'VERIFIED' | 'CANCELED';

function harness(
  opts: {
    user?: null | { id?: string; role?: string | null; deletedAt?: Date | null };
    identity?: null | { status: Status; decision: Decision };
    rowCount?: number;
  } = {},
) {
  const user =
    opts.user === null
      ? null
      : {
          id: opts.user?.id ?? USER,
          role: opts.user?.role ?? null,
          profile: { deletedAt: opts.user?.deletedAt ?? null },
          identityVerification:
            opts.identity === undefined ? { status: 'REQUIRES_INPUT', decision: null } : opts.identity,
        };
  const tx = {
    identityVerification: {
      updateMany: vi.fn().mockResolvedValue({ count: opts.rowCount ?? 1 }),
      // The promoter reads the row inside the transaction.
      findUnique: vi.fn().mockResolvedValue({ status: 'REQUIRES_INPUT', verifiedAt: null, decision: 'ACCEPTED' }),
    },
    profile: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const order: string[] = [];
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue(user) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      const r = await fn(tx);
      order.push('commit');
      return r;
    }),
  };
  const emit = vi.fn(async () => {
    order.push('emit');
  });
  const service = new AdminIdentityDecisionsService(prisma as never, { emit } as never);
  return { service, prisma, tx, emit, order };
}

const failure = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(AppException);
  const ex = e as AppException;
  return { status: ex.getStatus(), message: ex.message };
};

describe('AdminIdentityDecisionsService.refuse', () => {
  it('records the refusal conditionally and drops the level to BASIC in one transaction', async () => {
    const { service, prisma, tx } = harness({ identity: { status: 'VERIFIED', decision: null } });

    await expect(service.refuse(ACTOR, USER, { motif: 'EXPIRED', note: 'Périmé en 2024' })).resolves.toEqual({
      ok: true,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const w = tx.identityVerification.updateMany.mock.calls[0]![0];
    expect(w.where).toEqual({ userId: USER, decision: null });
    expect(w.data).toMatchObject({
      decision: 'REFUSED',
      decisionMotif: 'EXPIRED',
      decisionNote: 'Périmé en 2024',
      decidedByUserId: ACTOR,
    });
    expect(w.data.decidedAt).toBeInstanceOf(Date);
    expect(tx.profile.updateMany).toHaveBeenCalledWith({
      where: { userId: USER, verificationLevel: { in: ['IDENTITY', 'BUSINESS'] } },
      data: { verificationLevel: 'BASIC' },
    });
  });

  it('stores a null note when none is given', async () => {
    const { service, tx } = harness();
    await service.refuse(ACTOR, USER, { motif: 'ILLEGIBLE' });
    expect(tx.identityVerification.updateMany.mock.calls[0]![0].data.decisionNote).toBeNull();
  });

  it('notifies IDENTITY_DOCUMENTS_REQUIRED after the commit', async () => {
    const { service, emit, order } = harness();
    await service.refuse(ACTOR, USER, { motif: 'ILLEGIBLE' });
    expect(emit).toHaveBeenCalledWith({ userId: USER, mode: 'REPAIRER', type: 'IDENTITY_DOCUMENTS_REQUIRED' });
    expect(order).toEqual(['commit', 'emit']);
  });

  it('a lost race (count 0) is a CONFLICT that writes nothing else and notifies no one', async () => {
    const { service, tx, emit } = harness({ rowCount: 0 });
    const f = await failure(service.refuse(ACTOR, USER, { motif: 'ILLEGIBLE' }));
    expect(f.status).toBe(409);
    expect(tx.profile.updateMany).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('an already refused check is a CONFLICT, nothing written', async () => {
    const { service, prisma, emit } = harness({ identity: { status: 'VERIFIED', decision: 'REFUSED' } });
    const f = await failure(service.refuse(ACTOR, USER, { motif: 'ILLEGIBLE' }));
    expect(f).toEqual({ status: 409, message: 'Cette vérification est déjà refusée.' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('switching from a documents request to a refusal is allowed, conditional on the observed decision', async () => {
    const { service, tx } = harness({ identity: { status: 'VERIFIED', decision: 'DOCUMENTS_REQUESTED' } });
    await service.refuse(ACTOR, USER, { motif: 'INCONSISTENT' });
    expect(tx.identityVerification.updateMany.mock.calls[0]![0].where).toEqual({
      userId: USER,
      decision: 'DOCUMENTS_REQUESTED',
    });
  });
});

describe('AdminIdentityDecisionsService.requestDocuments', () => {
  it('records DOCUMENTS_REQUESTED over a refusal and drops the level', async () => {
    const { service, tx, emit } = harness({ identity: { status: 'VERIFIED', decision: 'REFUSED' } });
    await service.requestDocuments(ACTOR, USER, { motif: 'OTHER', note: 'Photo coupée' });
    const w = tx.identityVerification.updateMany.mock.calls[0]![0];
    expect(w.where).toEqual({ userId: USER, decision: 'REFUSED' });
    expect(w.data).toMatchObject({ decision: 'DOCUMENTS_REQUESTED', decisionMotif: 'OTHER', decisionNote: 'Photo coupée' });
    expect(tx.profile.updateMany).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({ userId: USER, mode: 'REPAIRER', type: 'IDENTITY_DOCUMENTS_REQUIRED' });
  });

  it('an already requested check is a CONFLICT', async () => {
    const { service, prisma } = harness({ identity: { status: 'REQUIRES_INPUT', decision: 'DOCUMENTS_REQUESTED' } });
    const f = await failure(service.requestDocuments(ACTOR, USER, { motif: 'ILLEGIBLE' }));
    expect(f).toEqual({ status: 409, message: 'De nouveaux documents ont déjà été demandés.' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('AdminIdentityDecisionsService.accept', () => {
  it('accepts an undecided unverified session and promotes inside the transaction', async () => {
    const { service, tx, emit, order } = harness({ identity: { status: 'REQUIRES_INPUT', decision: null } });
    await service.accept(ACTOR, USER, { note: 'Vu dans Stripe' });
    const w = tx.identityVerification.updateMany.mock.calls[0]![0];
    expect(w.where).toEqual({ userId: USER, decision: null });
    expect(w.data).toMatchObject({
      decision: 'ACCEPTED',
      decisionMotif: null,
      decisionNote: 'Vu dans Stripe',
      decidedByUserId: ACTOR,
    });
    // The promoter ran against the transaction client and granted BASIC → IDENTITY.
    expect(tx.identityVerification.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: USER } }));
    expect(tx.profile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER, verificationLevel: 'BASIC', verificationRevokedAt: null } }),
    );
    expect(emit).toHaveBeenCalledWith({ userId: USER, mode: 'REPAIRER', type: 'IDENTITY_VERIFIED' });
    expect(order).toEqual(['commit', 'emit']);
  });

  it('accepting after a refusal on a Stripe-verified session is allowed', async () => {
    const { service, tx } = harness({ identity: { status: 'VERIFIED', decision: 'REFUSED' } });
    await service.accept(ACTOR, USER, { note: 'Contrôle physique validé' });
    expect(tx.identityVerification.updateMany.mock.calls[0]![0].where).toEqual({ userId: USER, decision: 'REFUSED' });
    expect(tx.identityVerification.updateMany.mock.calls[0]![0].data.decisionNote).toBe('Contrôle physique validé');
  });

  it('a Stripe-verified undecided session cannot be accepted (422)', async () => {
    const { service, prisma } = harness({ identity: { status: 'VERIFIED', decision: null } });
    const f = await failure(service.accept(ACTOR, USER, { note: 'Justification valide' }));
    expect(f).toEqual({ status: 422, message: 'Stripe a déjà vérifié cette identité.' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('an already accepted check is a CONFLICT', async () => {
    const { service } = harness({ identity: { status: 'REQUIRES_INPUT', decision: 'ACCEPTED' } });
    expect(await failure(service.accept(ACTOR, USER, { note: 'Justification valide' }))).toEqual({
      status: 409,
      message: 'Cette vérification est déjà acceptée.',
    });
  });

  it('a lost race is a CONFLICT with no promotion and no notification', async () => {
    const { service, tx, emit } = harness({ rowCount: 0 });
    expect((await failure(service.accept(ACTOR, USER, { note: 'Justification valide' }))).status).toBe(409);
    expect(tx.profile.updateMany).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('AdminIdentityDecisionsService guards', () => {
  const actions = [
    ['accept', (s: AdminIdentityDecisionsService) => s.accept(ACTOR, USER, { note: 'Justification valide' })],
    ['refuse', (s: AdminIdentityDecisionsService) => s.refuse(ACTOR, USER, { motif: 'ILLEGIBLE' })],
    ['requestDocuments', (s: AdminIdentityDecisionsService) => s.requestDocuments(ACTOR, USER, { motif: 'ILLEGIBLE' })],
  ] as const;

  it.each(actions)('%s: unknown user → 404', async (_n, run) => {
    const { service } = harness({ user: null });
    expect(await failure(run(service))).toEqual({ status: 404, message: 'Utilisateur introuvable.' });
  });

  it.each(actions)('%s: no identity row → 422', async (_n, run) => {
    const { service, prisma } = harness({ identity: null });
    expect(await failure(run(service))).toEqual({
      status: 422,
      message: "Aucune vérification d'identité à décider pour ce compte.",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(actions)('%s: own account → 422', async (_n, run) => {
    // The loaded user IS the actor.
    const { service } = harness({ user: { id: ACTOR } });
    expect(await failure(run(service))).toEqual({
      status: 422,
      message: 'Vous ne pouvez pas appliquer cette action à votre propre compte.',
    });
  });

  it.each(actions)('%s: admin account → 422', async (_n, run) => {
    const { service } = harness({ user: { role: 'admin' } });
    expect(await failure(run(service))).toEqual({
      status: 422,
      message: "Ce compte est un compte administrateur. L'action est refusée.",
    });
  });

  // CF4-40, Review Focus 4: every staff role, not only `admin`.
  it.each(
    actions.flatMap(([n, run]) =>
      ['super_admin', 'moderation', 'support', 'finance', 'read_only'].map((role) => [n, role, run] as const),
    ),
  )('%s: %s account → 422', async (_n, role, run) => {
    const { service } = harness({ user: { role } });
    expect(await failure(run(service))).toEqual({
      status: 422,
      message: "Ce compte est un compte administrateur. L'action est refusée.",
    });
  });

  it.each(actions)('%s: deleted account → 422', async (_n, run) => {
    const { service } = harness({ user: { deletedAt: new Date() } });
    expect(await failure(run(service))).toEqual({
      status: 422,
      message: "Ce compte est supprimé. Aucune modification n'est possible.",
    });
  });
});
