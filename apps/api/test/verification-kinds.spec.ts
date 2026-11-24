import { describe, expect, it } from 'vitest';
import { verificationKinds } from '../src/admin/verification-kinds.js';

const NOW = new Date('2026-09-29T00:00:00Z');

const profile = (over: Record<string, unknown> = {}) => ({
  userId: 'u1',
  verificationLevel: 'IDENTITY',
  verifiedAt: new Date('2026-08-16T14:00:05.194Z'),
  updatedAt: new Date('2026-08-16T14:00:05.194Z'),
  ...over,
});

describe('row kind: niveau non étayé', () => {
  /**
   * Old case: admin-verification-queue.spec.ts > 'row kind: niveau non étayé' >
   * 'flags a level of IDENTITY with no stamped identity verification'.
   *
   * The live case, measured 2026-09-03: one profile at IDENTITY with verifiedAt stamped
   * 2026-08-16, whose IdentityVerification row is REQUIRES_INPUT, never stamped VERIFIED,
   * and created 2026-08-19 - three days AFTER the promotion. A public « Réparateur vérifié »
   * badge is showing to clients for it.
   */
  it('flags a level of IDENTITY with no stamped identity verification', () => {
    const hits = verificationKinds(
      {
        profile: profile(),
        identity: {
          status: 'REQUIRES_INPUT',
          verifiedAt: null,
          selfieFraudSignalAt: null,
          updatedAt: new Date('2026-08-19T21:58:41.397Z'),
        },
        business: null,
        registryRefused: null,
      },
      NOW,
    );
    // The old queue's precedence rule hid `identity_stuck` behind `level_unbacked` for this
    // same account (see 'multiple candidate kinds' below) - the pure function emits both as
    // candidates now, since the new list places one row per TYPE rather than one per account.
    expect(hits.map((h) => h.kind)).toContain('level_unbacked');
  });

  /** Old case: 'flags BUSINESS with no BusinessVerification row'. */
  it('flags BUSINESS with no BusinessVerification row', () => {
    const hits = verificationKinds(
      {
        profile: profile({ verificationLevel: 'BUSINESS' }),
        identity: { status: 'VERIFIED', verifiedAt: new Date(), selfieFraudSignalAt: null, updatedAt: new Date() },
        business: null,
        registryRefused: null,
      },
      NOW,
    );
    expect(hits.map((h) => h.kind)).toEqual(['level_unbacked']);
  });

  /** Old case: 'does not flag a level backed by a stamped verification'. */
  it('does not flag a level backed by a stamped verification', () => {
    const hits = verificationKinds(
      {
        profile: profile(),
        identity: {
          status: 'VERIFIED',
          verifiedAt: new Date('2026-08-16T13:00:00Z'),
          selfieFraudSignalAt: null,
          updatedAt: new Date(),
        },
        business: null,
        registryRefused: null,
      },
      NOW,
    );
    expect(hits).toEqual([]);
  });

  /**
   * Old case: 'handles IDENTITY with null verifiedAt without throwing' (FIX 4).
   * 🛑 An IDENTITY profile with null verifiedAt is precisely the kind of anomalous row
   * `level_unbacked` exists to surface. Using `profile.verifiedAt!` would throw rather
   * than reporting it. The fallback is `profile.updatedAt` (the last time anything changed).
   */
  it('handles IDENTITY with null verifiedAt without throwing', () => {
    const hits = verificationKinds(
      {
        profile: profile({ verificationLevel: 'IDENTITY', verifiedAt: null }),
        identity: {
          status: 'REQUIRES_INPUT',
          verifiedAt: null,
          selfieFraudSignalAt: null,
          updatedAt: new Date('2026-08-19T00:00:00Z'),
        },
        business: null,
        registryRefused: null,
      },
      NOW,
    );
    expect(hits.map((h) => h.kind)).toContain('level_unbacked');
  });
});

describe('multiple candidate kinds for one account', () => {
  /**
   * Old case: 'the precedence rule' > 'emits ONE row per account, and level_unbacked wins
   * over identity_stuck'. The precedence rule itself moved to the caller (one row per kind
   * now, not one row per account) - this test is carried over as: BOTH kinds are emitted as
   * candidates, since the caller places one per type.
   */
  it('emits both level_unbacked and identity_stuck when both apply', () => {
    const hits = verificationKinds(
      {
        profile: profile(),
        identity: {
          status: 'REQUIRES_INPUT',
          verifiedAt: null,
          selfieFraudSignalAt: null,
          updatedAt: new Date(),
        },
        business: null,
        registryRefused: null,
      },
      NOW,
    );
    expect(hits.map((h) => h.kind)).toEqual(['level_unbacked', 'identity_stuck']);
    expect(hits.find((h) => h.kind === 'level_unbacked')!.detail).toMatch(/REQUIRES_INPUT/);
  });

  /** Old case: 'a fraud signal outranks everything' - carried over as: fraud_signal is emitted. */
  it('emits fraud_signal when a selfie fraud signal is present', () => {
    const hits = verificationKinds(
      {
        profile: profile(),
        identity: {
          status: 'REQUIRES_INPUT',
          verifiedAt: null,
          selfieFraudSignalAt: new Date(),
          updatedAt: new Date(),
        },
        business: null,
        registryRefused: null,
      },
      NOW,
    );
    expect(hits.map((h) => h.kind)).toContain('fraud_signal');
  });

  /**
   * Old case: 'level_unbacked outranks registry_refused' (FIX 1). Carried over as: BOTH
   * kinds are emitted as candidates - level_unbacked belongs to IDENTITY/BUSINESS per the
   * profile level, registry_refused belongs to BUSINESS always (spec §5), so the caller
   * places each on its own row rather than picking one.
   */
  it('emits both level_unbacked and registry_refused when both apply', () => {
    const hits = verificationKinds(
      {
        profile: profile({ verificationLevel: 'BUSINESS' }),
        identity: { status: 'VERIFIED', verifiedAt: new Date(), selfieFraudSignalAt: null, updatedAt: new Date() },
        business: null,
        registryRefused: { target: '123456789', outcome: 'REJECTED', at: new Date('2026-09-01T00:00:00Z') },
      },
      NOW,
    );
    expect(hits.map((h) => h.kind)).toEqual(['level_unbacked', 'registry_refused']);
  });
});

describe('row kind: contrôle registre refusé', () => {
  /**
   * Old case: 'flags the latest REJECTED registry attempt with no BusinessVerification
   * since' (FIX 5, uses IDENTITY not BASIC).
   */
  it('flags the latest REJECTED registry attempt with no BusinessVerification since', () => {
    const hits = verificationKinds(
      {
        profile: profile({ verificationLevel: 'IDENTITY' }),
        identity: { status: 'VERIFIED', verifiedAt: new Date(), selfieFraudSignalAt: null, updatedAt: new Date() },
        business: null,
        registryRefused: { target: '123456789', outcome: 'REJECTED', at: new Date('2026-09-01T00:00:00Z') },
      },
      NOW,
    );
    expect(hits.map((h) => h.kind)).toEqual(['registry_refused']);
    expect(hits[0]!.detail).toContain('123456789');
    expect(hits[0]!.detail).toContain('refusé');
  });

  /**
   * Old case: 'flags a FAILED registry attempt, and does not call it a refusal'.
   * 🛑 FAILED IS A ROW TOO, AND IT WAS DROPPED. Spec §3.2's condition is « the latest
   * VerificationAttempt on channel REGISTRY at REJECTED **or** FAILED ». `FAILED` is a
   * real member (« provider or transport error ») written by `business.service.ts:81`.
   * The detail sentence must NOT say « refusé »: the registry refused nothing, the call
   * never reached a verdict, and an operator told otherwise draws a conclusion the
   * evidence does not support.
   */
  it('flags a FAILED registry attempt, and does not call it a refusal', () => {
    const hits = verificationKinds(
      {
        profile: profile({ verificationLevel: 'IDENTITY' }),
        identity: { status: 'VERIFIED', verifiedAt: new Date(), selfieFraudSignalAt: null, updatedAt: new Date() },
        business: null,
        registryRefused: { target: '987654321', outcome: 'FAILED', at: new Date('2026-09-02T00:00:00Z') },
      },
      NOW,
    );
    expect(hits.map((h) => h.kind)).toEqual(['registry_refused']);
    expect(hits[0]!.detail).toContain('987654321');
    expect(hits[0]!.detail).not.toContain('refusé');
  });

  /**
   * Old case: 'asks the database for BOTH outcomes, not just REJECTED'. The predicate
   * itself moved to the caller's Prisma `where` (the pure function no longer reads the
   * database) - that assertion is carried over into `admin-verifications-list.spec.ts`
   * instead, against the service's `findMany` call, not this pure function.
   */
});

describe('the queue is bounded and ordered', () => {
  /**
   * Old case: 'returns an empty array when nothing needs review'. Carried over directly:
   * no identity, no business, no registry hit, BUSINESS level backed -> no candidates.
   */
  it('returns an empty array when nothing needs review', () => {
    const hits = verificationKinds(
      {
        profile: profile({ verificationLevel: 'BUSINESS' }),
        identity: { status: 'VERIFIED', verifiedAt: new Date(), selfieFraudSignalAt: null, updatedAt: new Date() },
        business: { verifiedAt: new Date() },
        registryRefused: null,
      },
      NOW,
    );
    expect(hits).toEqual([]);
  });

  /**
   * Old cases: 'is newest concern first' and 'caps at 100 rows' - both concerned the
   * SERVICE's read/join/ordering/cap, not the pure kind-detection function. They are
   * carried over into `admin-verifications-list.spec.ts` (ordering: newest first; and the
   * profile cap is REMOVED per the brief, so there is no cap test to carry over - see the
   * service's comment on why `take: 100` is gone).
   */
});

describe('display fields and level_unbacked/registry_refused independent of profile level', () => {
  /** No profile.verificationLevel set -> level_unbacked never fires (neither branch matches). */
  it('does not flag level_unbacked when the profile level is neither IDENTITY nor BUSINESS', () => {
    const hits = verificationKinds(
      {
        profile: profile({ verificationLevel: null }),
        identity: { status: 'VERIFIED', verifiedAt: new Date(), selfieFraudSignalAt: null, updatedAt: new Date() },
        business: null,
        registryRefused: null,
      },
      NOW,
    );
    expect(hits.map((h) => h.kind)).toEqual([]);
  });
});
