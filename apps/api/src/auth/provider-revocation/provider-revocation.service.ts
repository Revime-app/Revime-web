import { Inject, Injectable, Optional } from '@nestjs/common';
import { STEP_UP_COPY, type StepUpProvider } from '@revime/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AdminAlertsService, type CreateAdminAlertInput } from '../../admin/admin-alerts.service.js';
import { appleKeyFromEnv, exchangeAppleCode, revokeAppleToken, type AppleKeyConfig } from './apple-client.js';
import { revokeGoogleToken } from './google-client.js';

/**
 * V9 U3 (`CLIENT_FEEDBACK_V9.md` B2 (5), `DEC9-09` (5), (6), `DEC9-10` (1) to (3)). Revokes the Apple
 * and Google sign-ins of an account being deleted, BEFORE the scrub (the scrub deletes the login rows).
 *
 * - Google: the stored access token, only while still valid (the provider confirmation just refreshed
 *   it); an expired one cannot be revoked.
 * - Apple: no token is stored (native id-token sign-in), so the authorization code from the deletion's
 *   Apple confirmation is exchanged, then the refresh token revoked. Needs the client's key.
 *
 * Never throws: Apple's TN3194 and `DEC9-09` (5) both say the deletion goes through anyway. A
 * self-deletion that ends without a revocation raises `PROVIDER_REVOKE_FAILED`, except for a missing
 * key (a log line, `DEC9-09` (6)); a dashboard deletion only logs (`DEC9-10` (2)).
 * 🛑 No token, code or key in a log line or an alert.
 */
export type ProviderConfirmation = { provider: StepUpProvider; appleAuthorizationCode?: string };
export type RevocationResult = 'REVOKED' | 'SKIPPED_NO_KEY' | 'SKIPPED_NO_TOKEN' | 'FAILED';
export type RevocationOutcome = { provider: StepUpProvider; result: RevocationResult };
export type RevocationInput = { userId: string; source: 'SELF' | 'ADMIN'; confirmation: ProviderConfirmation | null };

export type ProviderRevocationDeps = {
  fetch: typeof fetch;
  clock: () => Date;
  appleKey: () => AppleKeyConfig | null;
  alerts: { raise(input: CreateAdminAlertInput): Promise<void> };
  log: (line: string) => void;
};

export const PROVIDER_REVOCATION_DEPS = 'PROVIDER_REVOCATION_DEPS';

const REASON: Partial<Record<RevocationResult, string>> = {
  SKIPPED_NO_TOKEN: 'aucun jeton valide',
  FAILED: 'refus du fournisseur',
};

type LoginRow = { providerId: string; accessToken: string | null; accessTokenExpiresAt: Date | null };

@Injectable()
export class ProviderRevocationService {
  private readonly deps: ProviderRevocationDeps;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(PROVIDER_REVOCATION_DEPS) deps?: ProviderRevocationDeps,
  ) {
    this.deps = deps ?? {
      fetch: (...args) => globalThis.fetch(...args),
      clock: () => new Date(),
      appleKey: () => appleKeyFromEnv(process.env),
      alerts: new AdminAlertsService(prisma),
      log: (line) => console.log(line),
    };
  }

  async revokeAll(input: RevocationInput): Promise<RevocationOutcome[]> {
    let rows: LoginRow[];
    try {
      rows = await this.prisma.account.findMany({
        where: { userId: input.userId, providerId: { in: ['google', 'apple'] } },
        select: { providerId: true, accessToken: true, accessTokenExpiresAt: true },
      });
    } catch (err) {
      this.deps.log(`[revocation] login rows unreadable source=${input.source}: ${(err as Error).name}`);
      return [];
    }

    const outcomes: RevocationOutcome[] = [];
    for (const row of rows) {
      const provider: StepUpProvider = row.providerId === 'apple' ? 'APPLE' : 'GOOGLE';
      const result = provider === 'GOOGLE' ? await this.google(row) : await this.apple(input.confirmation);
      outcomes.push({ provider, result });
      this.deps.log(`[revocation] ${provider} ${result} source=${input.source}`);
      if (input.source === 'SELF' && REASON[result]) await this.alert(input.userId, provider, result);
    }
    return outcomes;
  }

  private async google(row: LoginRow): Promise<RevocationResult> {
    const valid = row.accessToken && row.accessTokenExpiresAt && row.accessTokenExpiresAt.getTime() > this.deps.clock().getTime();
    if (!valid) return 'SKIPPED_NO_TOKEN';
    try {
      await revokeGoogleToken({ fetch: this.deps.fetch }, row.accessToken!);
      return 'REVOKED';
    } catch {
      return 'FAILED';
    }
  }

  private async apple(confirmation: ProviderConfirmation | null): Promise<RevocationResult> {
    const key = this.deps.appleKey();
    if (!key) return 'SKIPPED_NO_KEY';
    const code = confirmation?.provider === 'APPLE' ? confirmation.appleAuthorizationCode : undefined;
    if (!code) return 'SKIPPED_NO_TOKEN';
    try {
      const deps = { fetch: this.deps.fetch, key, now: this.deps.clock() };
      const { refreshToken } = await exchangeAppleCode(deps, code);
      await revokeAppleToken(deps, refreshToken);
      return 'REVOKED';
    } catch {
      return 'FAILED';
    }
  }

  private async alert(userId: string, provider: StepUpProvider, result: RevocationResult): Promise<void> {
    try {
      await this.deps.alerts.raise({
        type: 'PROVIDER_REVOKE_FAILED',
        severity: 'MEDIUM',
        title: 'Révocation Apple / Google échouée',
        message: `La connexion ${STEP_UP_COPY.providerLabel(provider)} n’a pas pu être révoquée à la suppression de ce compte (${REASON[result]}). Le compte est bien supprimé.`,
        targetType: 'User',
        targetId: userId,
        link: `/utilisateurs/${userId}`,
        metadata: { provider, result },
      });
    } catch (err) {
      this.deps.log(`[revocation] alert not raised: ${(err as Error).name}`);
    }
  }
}
