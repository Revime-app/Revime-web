import { describe, expect, it } from 'vitest';
import {
  API_ERROR_CODES,
  CANONICAL_PRIVACY_ACCEPTANCE_TEXT,
  CGU_ACCEPTANCE_REQUIRED_TEXT,
  CGU_BOX_LABEL,
  CURRENT_PRIVACY_VERSION,
  PRIVACY_BOX_LABEL,
  SIGNUP_TERMS_HINT,
  SIGNUP_TERMS_SUBTITLE,
  USERNAME_STEP_TITLE,
  acceptSignupTermsSchema,
  computeConsentChecksum,
  consentProofKindSchema,
  createConsentProofInputSchema,
  isSocialMethod,
  nextSignupStep,
  signUpSchema,
  termsTitle,
  type MeResponse,
} from '../src/index.js';

/**
 * V9 B1 (`CLIENT_FEEDBACK_V9.md` `DEC9-04`…`06`, `FND9-017`). Which completion step an account still
 * owes, read from server state only, so a slow server right after sign-in can never skip one.
 */
type Me = Pick<MeResponse, 'signupMethod' | 'usernameConfirmedAt' | 'cguVersion' | 'profile'>;
const profile = (onboardingCompletedAt: string | null) => ({ onboardingCompletedAt }) as MeResponse['profile'];
const me = (over: Partial<Me>): Me => ({
  signupMethod: 'GOOGLE',
  usernameConfirmedAt: null,
  cguVersion: null,
  profile: profile(null),
  ...over,
});

describe('nextSignupStep', () => {
  it('fails closed with no me: no step, no redirect', () => {
    expect(nextSignupStep(null)).toBeNull();
    expect(nextSignupStep(undefined)).toBeNull();
  });

  it('walks a new social account through username, role, terms, then nothing', () => {
    expect(nextSignupStep(me({}))).toBe('USERNAME');
    expect(nextSignupStep(me({ usernameConfirmedAt: '2026-11-19T10:00:00.000Z' }))).toBe('ROLE');
    expect(
      nextSignupStep(me({ usernameConfirmedAt: '2026-11-19T10:00:00.000Z', profile: profile('2026-11-19T10:01:00.000Z') })),
    ).toBe('TERMS');
    expect(
      nextSignupStep(
        me({ usernameConfirmedAt: '2026-11-19T10:00:00.000Z', profile: profile('2026-11-19T10:01:00.000Z'), cguVersion: '2026-10-10' }),
      ),
    ).toBeNull();
  });

  it('asks the username of Apple accounts too', () => {
    expect(nextSignupStep(me({ signupMethod: 'APPLE' }))).toBe('USERNAME');
  });

  it('never asks an e-mail account for its username; only the boxes when acceptance is missing', () => {
    expect(nextSignupStep(me({ signupMethod: 'EMAIL', profile: profile('2026-09-01T00:00:00.000Z') }))).toBe('TERMS');
  });

  it('asks a seeded account (no sign-up method) for the boxes only', () => {
    expect(nextSignupStep(me({ signupMethod: null, profile: profile('2026-09-01T00:00:00.000Z') }))).toBe('TERMS');
  });

  it('reads an absent profile as a role still owed', () => {
    expect(nextSignupStep(me({ signupMethod: 'EMAIL', profile: null as unknown as MeResponse['profile'] }))).toBe('ROLE');
  });
});

describe('termsTitle and isSocialMethod', () => {
  it('titles the screen « Dernière étape » for Apple and Google, « Avant de continuer » otherwise', () => {
    expect(termsTitle({ signupMethod: 'APPLE' })).toBe('Dernière étape');
    expect(termsTitle({ signupMethod: 'GOOGLE' })).toBe('Dernière étape');
    expect(termsTitle({ signupMethod: 'EMAIL' })).toBe('Avant de continuer');
    expect(termsTitle({ signupMethod: null })).toBe('Avant de continuer');
  });

  it('knows which methods are social', () => {
    expect([isSocialMethod('APPLE'), isSocialMethod('GOOGLE'), isSocialMethod('EMAIL'), isSocialMethod(null)]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
});

describe('copy, verbatim from the client and the decisions', () => {
  it('holds the exact strings', () => {
    expect(CGU_BOX_LABEL).toBe("J'accepte les Conditions générales d'utilisation");
    expect(PRIVACY_BOX_LABEL).toBe("J'accepte la Politique de confidentialité");
    expect(SIGNUP_TERMS_SUBTITLE).toBe("Avant de continuer, merci d'accepter nos conditions.");
    expect(SIGNUP_TERMS_HINT).toBe("Le bouton s'active quand les 2 cases sont cochées.");
    expect(CGU_ACCEPTANCE_REQUIRED_TEXT).toBe("Acceptez les Conditions générales d'utilisation pour continuer.");
    expect(USERNAME_STEP_TITLE).toBe("Choisissez votre nom d'utilisateur");
    expect(CANONICAL_PRIVACY_ACCEPTANCE_TEXT).toBe(
      "L'utilisateur reconnaît avoir pris connaissance de la Politique de confidentialité de REVIME et l'accepter.",
    );
    expect(CURRENT_PRIVACY_VERSION).toBe('2026-11-19');
  });

  it('knows the new error code', () => {
    expect(API_ERROR_CODES).toContain('CGU_ACCEPTANCE_REQUIRED');
  });
});

describe('the privacy proof', () => {
  it('is a proof kind with its own version field', () => {
    expect(consentProofKindSchema.parse('PRIVACY_ACCEPTANCE')).toBe('PRIVACY_ACCEPTANCE');
    const parsed = createConsentProofInputSchema.parse({
      userId: 'u1',
      kind: 'PRIVACY_ACCEPTANCE',
      privacyVersion: '2026-11-19',
      legalTextSnapshot: 'T',
      actionProof: 'X',
    });
    expect(parsed.privacyVersion).toBe('2026-11-19');
  });

  it('keeps every existing checksum unchanged when no privacy version is given', () => {
    const base = {
      userId: 'u1',
      kind: 'CGU_ACCEPTANCE' as const,
      timestamp: '2026-11-19T10:00:00.000Z',
      actionProof: 'X',
      legalTextSnapshot: 'T',
      cguVersion: '2026-10-10',
    };
    // Computed from the shared package's built output BEFORE this task (2026-11-19).
    expect(computeConsentChecksum(base)).toBe('f3e4ecff50a98088a2a6ebaa921a0d3724e421fc0263612d8ab5ea2da13d7b22');
    expect(computeConsentChecksum({ ...base, privacyVersion: null })).toBe(
      'f3e4ecff50a98088a2a6ebaa921a0d3724e421fc0263612d8ab5ea2da13d7b22',
    );
    expect(computeConsentChecksum({ ...base, privacyVersion: '2026-11-19' })).not.toBe(
      'f3e4ecff50a98088a2a6ebaa921a0d3724e421fc0263612d8ab5ea2da13d7b22',
    );
  });
});

describe('the sign-up form schema', () => {
  const form = {
    firstName: 'Ana',
    lastName: 'Lopez',
    username: 'ana_l',
    email: 'ana@example.com',
    phone: '0612345678',
    password: 'correct-horse-1',
    cguAccepted: true as const,
  };

  it('refuses an unticked privacy box with a French sentence', () => {
    const r = signUpSchema.safeParse({ ...form, privacyAccepted: false });
    expect(r.success).toBe(false);
    expect(r.error?.issues.find((i) => i.path[0] === 'privacyAccepted')?.message).toBe(
      'Vous devez accepter la Politique de confidentialité.',
    );
  });

  it('accepts both boxes ticked', () => {
    expect(signUpSchema.safeParse({ ...form, privacyAccepted: true }).success).toBe(true);
  });

  it('takes the acceptance body with the CGU version only', () => {
    expect(acceptSignupTermsSchema.parse({ cguVersion: '2026-10-10' })).toEqual({ cguVersion: '2026-10-10' });
  });
});
