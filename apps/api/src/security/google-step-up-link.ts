import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * V9 U3 final review (Important 1). A Google confirmation is bound to the session that started it.
 *
 * `POST /security/step-up/google/start` issues a random nonce for the session; the app passes it to
 * Better Auth's `linkSocial` as `additionalData`, which Better Auth keeps in the OAuth state. When the
 * link callback refreshes the user's existing Google row, Better Auth runs the account `update.before`
 * hook inline in that request, where `getOAuthState()` returns the state (not `update.after`, which runs
 * once the request state is gone: `ISS9-011`): this file records that the link with
 * THIS nonce happened for THIS user. A plain Google sign-in (no `link`) and another user's link record
 * nothing, so a stolen session cannot ride on a sign-in made elsewhere.
 */
export const GOOGLE_LINKED_PREFIX = 'step-up-google-linked:';
const NONCE = /^[A-Za-z0-9_-]{16,128}$/;
const LINK_RECORD_TTL_MS = 10 * 60 * 1000;

type Account = { providerId: string; userId: string };

export function googleStepUpLinkRecord(account: Account, state: unknown): { identifier: string; userId: string } | null {
  if (account.providerId !== 'google' || !state || typeof state !== 'object') return null;
  const { stepUpNonce, link } = state as { stepUpNonce?: unknown; link?: { userId?: unknown } };
  if (typeof stepUpNonce !== 'string' || !NONCE.test(stepUpNonce)) return null;
  if (!link || String(link.userId) !== account.userId) return null;
  return { identifier: `${GOOGLE_LINKED_PREFIX}${stepUpNonce}`, userId: account.userId };
}

type StateGetter = () => Promise<unknown>;
type HookDeps = { getState: StateGetter; now?: () => Date; log?: (msg: string, meta: unknown) => void };

/**
 * The `databaseHooks.account.update` entry `auth.ts` installs.
 *
 * 🛑 `before`, never `after` (V9 `ISS9-011`, `FND9-029`): Better Auth runs `after` hooks once the request
 * state is gone (`auth/base.mjs` wraps the handler in `runWithAdapter`, whose queued hooks run after
 * `handler(request)` returns), so `getOAuthState()` throws there and no link was ever recorded. `before`
 * runs inline in the link callback, with the endpoint context as its second argument. It sees the update's
 * data, not the row, so the provider comes from the callback's `params.id` and the user from the state's
 * `link.userId`: Better Auth updates an existing account in a link callback only after checking it belongs
 * to `link.userId` (`api/routes/callback.mjs`), and a different Google identity takes the create path.
 * Returns nothing, so the update itself is never changed or blocked.
 */
export function googleStepUpAccountUpdateHooks(prisma: Pick<PrismaClient, 'verification'>, deps: HookDeps) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((msg, meta) => console.error(msg, meta));
  return {
    before: async (_data: unknown, context: unknown): Promise<void> => {
      const providerId = (context as { params?: { id?: unknown } } | null)?.params?.id;
      if (providerId !== 'google') return;
      let userId: string | undefined;
      try {
        const state = await deps.getState();
        const linkUserId = (state as { link?: { userId?: unknown } } | null)?.link?.userId;
        if (linkUserId === undefined || linkUserId === null) return;
        userId = String(linkUserId);
        await recordGoogleStepUpLink(prisma, { providerId, userId }, state, now());
      } catch (error) {
        log('[step-up] could not record the Google link', {
          userId,
          error: error instanceof Error ? error.name : String(error),
        });
      }
    },
  };
}

export async function recordGoogleStepUpLink(
  prisma: Pick<PrismaClient, 'verification'>,
  account: Account,
  state: unknown,
  now: Date,
): Promise<void> {
  const record = googleStepUpLinkRecord(account, state);
  if (!record) return;
  await prisma.verification.deleteMany({ where: { identifier: record.identifier } });
  await prisma.verification.create({
    data: { id: randomUUID(), identifier: record.identifier, value: record.userId, expiresAt: new Date(now.getTime() + LINK_RECORD_TTL_MS) },
  });
}
