import { describe, expect, it } from 'vitest';
import {
  deletionRule,
  STEP_UP_COPY,
  stepUpAppleSchema,
  stepUpChoices,
  type StepUpProvider,
  type StepUpPurpose,
} from '../src/index.js';

/**
 * V9 U3 (`CLIENT_FEEDBACK_V9.md` `DEC9-09`, `DEC9-10`). What the sheet offers, and what the server
 * accepts for a deletion. One rule for both sides so they cannot drift.
 */
const choose = (providers: StepUpProvider[], hasPassword: boolean, purpose: StepUpPurpose, appleAvailable = true) =>
  stepUpChoices({ providers, hasPassword, purpose, appleAvailable });

describe('V9 U3 stepUpChoices', () => {
  it('sensitive actions: the password, the providers, the code only for an account with neither', () => {
    expect(choose([], true, 'SENSITIVE')).toEqual(['PASSWORD']);
    expect(choose([], false, 'SENSITIVE')).toEqual(['EMAIL_CODE']);
    expect(choose(['GOOGLE'], false, 'SENSITIVE')).toEqual(['GOOGLE']);
    expect(choose(['GOOGLE'], true, 'SENSITIVE')).toEqual(['PASSWORD', 'GOOGLE']);
    expect(choose(['APPLE'], false, 'SENSITIVE', false)).toEqual([]);
    expect(choose(['APPLE'], true, 'SENSITIVE', false)).toEqual(['PASSWORD']);
  });

  it('deletion: the provider when one is usable, the password only when none is', () => {
    expect(choose(['GOOGLE'], true, 'DELETE')).toEqual(['GOOGLE']);
    expect(choose(['APPLE'], true, 'DELETE', true)).toEqual(['APPLE']);
    expect(choose(['APPLE'], true, 'DELETE', false)).toEqual(['PASSWORD']);
    expect(choose(['APPLE'], false, 'DELETE', false)).toEqual([]);
    expect(choose([], true, 'DELETE')).toEqual(['PASSWORD']);
    expect(choose([], false, 'DELETE')).toEqual(['EMAIL_CODE']);
  });

  it('never offers the e-mailed code to an account linked to a provider', () => {
    const sets: StepUpProvider[][] = [['APPLE'], ['GOOGLE'], ['APPLE', 'GOOGLE']];
    for (const providers of sets)
      for (const hasPassword of [true, false])
        for (const purpose of ['DELETE', 'SENSITIVE'] as const)
          for (const appleAvailable of [true, false])
            expect(choose(providers, hasPassword, purpose, appleAvailable)).not.toContain('EMAIL_CODE');
  });
});

describe('V9 U3 deletionRule', () => {
  it('asks the provider, except an Apple-only link with a password', () => {
    expect(deletionRule({ providers: [], hasPassword: true })).toBe('STEP_UP');
    expect(deletionRule({ providers: [], hasPassword: false })).toBe('STEP_UP');
    expect(deletionRule({ providers: ['GOOGLE'], hasPassword: true })).toBe('PROVIDER');
    expect(deletionRule({ providers: ['APPLE'], hasPassword: false })).toBe('PROVIDER');
    expect(deletionRule({ providers: ['APPLE'], hasPassword: true })).toBe('PROVIDER_OR_PASSWORD');
  });
});

describe('V9 U3 copy and schema', () => {
  it('keeps the agreed sentences', () => {
    expect(STEP_UP_COPY.title).toBe('Confirmez votre identité');
    expect(STEP_UP_COPY.providerSubtitle('APPLE')).toBe('Pour votre sécurité, reconnectez-vous avec Apple avant de continuer.');
    expect(STEP_UP_COPY.providerSubtitle('GOOGLE')).toBe('Pour votre sécurité, reconnectez-vous avec Google avant de continuer.');
    expect(STEP_UP_COPY.appleMismatch).toBe('Ce compte Apple ne correspond pas à votre compte Revime.');
    expect(STEP_UP_COPY.providerLabel('GOOGLE')).toBe('Google');
  });

  it('has no em or en dash anywhere', () => {
    const texts = [
      STEP_UP_COPY.title,
      STEP_UP_COPY.appleMismatch,
      STEP_UP_COPY.googleNotConfirmed,
      STEP_UP_COPY.codeRefused,
      STEP_UP_COPY.noChoice,
      ...(['APPLE', 'GOOGLE'] as const).flatMap((p) => [STEP_UP_COPY.providerSubtitle(p), STEP_UP_COPY.passwordOrProviderSubtitle(p)]),
    ];
    for (const t of texts) expect(t).not.toMatch(/[–—]/);
  });

  it('refuses an empty Apple identity token', () => {
    expect(stepUpAppleSchema.safeParse({ identityToken: '' }).success).toBe(false);
    expect(stepUpAppleSchema.safeParse({ identityToken: 'a.b.c', authorizationCode: 'c1' }).success).toBe(true);
  });
});
