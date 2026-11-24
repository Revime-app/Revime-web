import { APIError } from 'better-auth/api';
import { isLocked, registerFailure, registerSuccess, settle, type ThrottleRule } from './policy.js';
import type { ThrottleScope, ThrottleStore } from './store.js';

/** Prune at most this often per process: the delete is cheap but need not run on every failure. */
const PRUNE_EVERY_MS = 10 * 60 * 1000;

export type FailureOutcome = { lockedNow: boolean; lockedUntil: Date | null; level: number; recentKeys: string[] };

/** The same normal form for every e-mail key: Better Auth lowercases on sign-in, typing does not. */
export function throttleKey(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * 🛑 One sentence for every lock, whatever the counter and whether the account exists, so the
 * answer never tells anyone which addresses have an account. The time is Paris time, which is
 * what the client and every user read. Code `TOO_MANY_REQUESTS` on purpose: installed builds map
 * that code to their own French text, an unknown code to « Identifiants incorrects. ».
 */
export function lockedError(lockedUntil: Date): APIError {
  return new APIError('TOO_MANY_REQUESTS', {
    code: 'TOO_MANY_REQUESTS',
    message: `Trop de tentatives. Votre compte est temporairement bloqué jusqu'à ${parisTime(lockedUntil)}. Réessayez plus tard ou réinitialisez votre mot de passe.`,
    lockedUntil: lockedUntil.toISOString(),
  });
}

/**
 * V9 U1 (V9 B2 (3)). The wrong-code lock's own sentence. It never mentions a password: an Apple or
 * Google account has none, and a password reset does not lift this lock anyway
 * (`clearLockAfterPasswordReset` clears the login lock only). Only the code entry is locked, so it
 * does not say the account is.
 */
export function codeLockedError(lockedUntil: Date): APIError {
  return new APIError('TOO_MANY_REQUESTS', {
    code: 'TOO_MANY_REQUESTS',
    message: `Trop de tentatives avec un code incorrect. Réessayez à partir de ${parisTime(lockedUntil)}.`,
    lockedUntil: lockedUntil.toISOString(),
  });
}

function parisTime(at: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(at);
}

/** V7 A11 / D3 (U2). The lock-out counters, over a store, with an injectable clock for the specs. */
export class AuthThrottle {
  private lastPrune = 0;

  constructor(
    private readonly store: ThrottleStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  now(): Date {
    return this.clock();
  }

  async lockedUntil(scope: ThrottleScope, key: string): Promise<Date | null> {
    const state = await this.store.read(scope, key);
    return isLocked(state, this.clock()) ? state.lockedUntil : null;
  }

  /** Throws the lock error when `key` is locked in `scope`. */
  async assertOpen(scope: ThrottleScope, key: string): Promise<void> {
    const until = await this.lockedUntil(scope, key);
    if (until) throw scope === 'CODE_ACCOUNT' ? codeLockedError(until) : lockedError(until);
  }

  async fail(scope: ThrottleScope, key: string, rule: ThrottleRule, recentKey?: string): Promise<FailureOutcome> {
    const now = this.clock();
    const outcome = await this.store.mutate(scope, key, (state) => {
      const { state: next, lockedNow } = registerFailure(state, rule, now, recentKey);
      return {
        state: next,
        result: { lockedNow, lockedUntil: next.lockedUntil, level: next.level, recentKeys: next.recentKeys },
      };
    });
    await this.maybePrune(now);
    return outcome;
  }

  async succeed(scope: ThrottleScope, key: string, rule: ThrottleRule): Promise<void> {
    const now = this.clock();
    // Read first: most logins have no failure to forget, and `mutate` would create a row for each.
    if (settle(await this.store.read(scope, key), rule, now).failures === 0) return;
    await this.store.mutate(scope, key, (state) => ({ state: registerSuccess(settle(state, rule, now)), result: undefined }));
  }

  /** Lifts a lock and its ladder (password reset, admin unlock). */
  async clear(scope: ThrottleScope, key: string): Promise<void> {
    await this.store.remove(scope, key);
  }

  private async maybePrune(now: Date): Promise<void> {
    if (now.getTime() - this.lastPrune < PRUNE_EVERY_MS) return;
    this.lastPrune = now.getTime();
    try {
      await this.store.prune(now);
    } catch (err) {
      console.error('[auth-throttle] prune failed', err);
    }
  }
}
