import { Injectable } from '@nestjs/common';
import type { ConnectOnboardingResponse, ConnectStatusResponse } from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { claimStripeEvent } from '../common/stripe-event-claim.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isConnectEnabled } from './config.js';
import { connectGateway, type ConnectAccountSummary } from './gateway.js';
import { CommandesService } from '../commandes/commandes.service.js';

const CONNECT_OFF = 'Les virements ne sont pas encore disponibles.';
const NOT_A_REPAIRER = 'Activez le mode réparateur.';

@Injectable()
export class ConnectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandesService: CommandesService,
  ) {}

  /**
   * Creates the connected account on first call, then always mints a FRESH
   * Account Link.
   *
   * No re-entrancy machinery, unlike P1's `resolvePending`, and the asymmetry is
   * deliberate rather than an omission: a Checkout Session is a payable object, so
   * two of them is a double charge. An Account Link is single-use, expires in
   * minutes, and Stripe's own documented recovery for a stale one is to mint
   * another. There is nothing to protect.
   */
  async startOnboarding(userId: string, surface: 'app' | 'web' = 'app'): Promise<ConnectOnboardingResponse> {
    if (!isConnectEnabled()) {
      throw new AppException('UNPROCESSABLE_ENTITY', CONNECT_OFF);
    }

    const profile = await this.prisma.profile.findFirst({
      where: { userId, deletedAt: null },
      select: { repairerEnabled: true },
    });
    if (!profile?.repairerEnabled) {
      throw new AppException('FORBIDDEN', NOT_A_REPAIRER);
    }

    const accountId = await this.ensureAccount(userId);
    const base = process.env.PUBLIC_API_URL;

    const session = await connectGateway().createAccountSession(accountId);

    const link = await connectGateway().createOnboardingLink({
      accountId,
      // No `?u=`. The return route reads nothing, so the parameter was a user id
      // handed to a browser for no purpose - and a parameter nobody reads is an
      // invitation to start reading it. `refresh` genuinely does read `u`, because it
      // must mint a link for a specific account, so it keeps it. The Identity sibling
      // takes no parameter either.
      // A réparateur who started on the website comes back to the website (`/connect/return-web`),
      // the app's own flow is unchanged. Both routes stay static and read nothing.
      returnUrl: surface === 'web' ? `${base}/api/v1/connect/return-web` : `${base}/api/v1/connect/return`,
      refreshUrl: surface === 'web' ? `${base}/api/v1/connect/return-web` : `${base}/api/v1/connect/refresh`,
    });

    return {
      clientSecret: session.clientSecret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
      url: link.url,
    };
  }

  /**
   * Returns the existing Stripe account id, creating one if this is the first
   * call.
   *
   * The Stripe create happens BEFORE the insert, so the one race that matters -
   * two concurrent first calls - is caught by the `userId` unique index rather
   * than by a check-then-create window. The loser's Stripe account is orphaned,
   * which is why the P2002 branch logs its id: an orphaned test-mode account is
   * untidy, an orphaned live one is something the owner may want to remove from
   * the Dashboard, and a silent catch would leave no trace of it.
   */
  private async ensureAccount(userId: string): Promise<string> {
    const existing = await this.prisma.connectAccount.findUnique({
      where: { userId },
      select: { stripeAccountId: true },
    });
    if (existing) return existing.stripeAccountId;

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });

    const account = await connectGateway().createAccount({ email: user.email });

    try {
      await this.prisma.connectAccount.create({
        data: {
          userId,
          stripeAccountId: account.id,
          status: 'PENDING',
          transfersActive: account.transfersActive,
          disabledReason: account.disabledReason,
          lastSyncedAt: new Date(),
        },
      });
      return account.id;
    } catch (e: unknown) {
      if (!isUniqueViolation(e)) throw e;

      console.warn(
        '[connect] lost the create race; orphaned Stripe account',
        account.id,
        'for user',
        userId,
      );
      const winner = await this.prisma.connectAccount.findUniqueOrThrow({
        where: { userId },
        select: { stripeAccountId: true },
      });
      return winner.stripeAccountId;
    }
  }

  /**
   * The cached row, or a synthesised not-started shape.
   *
   * Deliberately does NOT call Stripe. The webhook is what keeps this row current,
   * and a read that repaired its own staleness would become a second writer -
   * which is the property `promote-connect.ts` depends on not existing.
   */
  /** V7 U2b: whether payouts already go to a bank account, which makes the setup an IBAN change. */
  async hasIbanOnFile(userId: string): Promise<boolean> {
    const row = await this.prisma.connectAccount.findUnique({ where: { userId }, select: { ibanLast4: true } });
    return Boolean(row?.ibanLast4);
  }

  async status(userId: string): Promise<ConnectStatusResponse> {
    const row = await this.prisma.connectAccount.findUnique({
      where: { userId },
      select: {
        status: true,
        entityType: true,
        transfersActive: true,
        lastSyncedAt: true,
      },
    });

    if (!row) {
      return { status: null, entityType: null, transfersActive: false, lastSyncedAt: null };
    }

    return {
      status: row.status,
      entityType: row.entityType,
      transfersActive: row.transfersActive,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    };
  }

  /**
   * Where the browser goes when Stripe decides the Account Link is unusable - it
   * expired, it was revisited, or a link-preview bot fetched it.
   *
   * Stripe's documented requirement is to mint a new link with the same parameters
   * and send the user straight back in, without involving the app. Everything that
   * can go wrong here ends in `revime://connect/retour` rather than an error page:
   * this route is reached by a browser, so a JSON envelope or a 500 is a dead end
   * for a réparateur who was mid-onboarding.
   */
  async refreshTarget(userId: string): Promise<string> {
    const fallback = 'revime://connect/retour';
    if (!isConnectEnabled()) return fallback;

    const row = await this.prisma.connectAccount.findUnique({
      where: { userId },
      select: { stripeAccountId: true },
    });
    if (!row) return fallback;

    // Read the account id outside the try, so the try covers ONLY the gateway call.
    // A bare catch must not swallow our own bugs and report them as a Stripe failure.
    const accountId = row.stripeAccountId;
    const base = process.env.PUBLIC_API_URL;
    try {
      const link = await connectGateway().createOnboardingLink({
        accountId,
        returnUrl: `${base}/api/v1/connect/return`,
        refreshUrl: `${base}/api/v1/connect/refresh?u=${userId}`,
      });
      return link.url;
    } catch {
      console.warn('[connect] could not mint a refresh link for user', userId);
      return fallback;
    }
  }

  /**
   * Every Connect delivery lands here.
   *
   * Order matters, and it is P1's order for P1's reason. Verify, then claim the
   * event id, then act. Claiming first is what makes a redelivery a no-op: Stripe
   * retries on any non-2xx and on its own schedule, so the same event arrives more
   * than once as a matter of course rather than as a fault.
   */
  async handleWebhook(raw: Buffer, signature: string | undefined): Promise<void> {
    if (!signature) {
      throw new AppException('VALIDATION_FAILED', 'Signature manquante.');
    }

    // A missing secret is OUR fault, not the caller's. Distinguished from a bad
    // signature deliberately: conflating them turns a rotated-and-not-redeployed
    // secret into what looks like an attack.
    if (!process.env.STRIPE_CONNECT_WEBHOOK_SECRET) {
      throw new AppException('INTERNAL', 'Configuration de paiement incomplète.');
    }

    let event;
    try {
      event = connectGateway().constructEvent(raw, signature);
    } catch {
      console.warn('[connect] webhook signature verification failed');
      throw new AppException('VALIDATION_FAILED', 'Signature invalide.');
    }

    // The claim key is namespaced PER ENDPOINT rather than being the bare event id.
    //
    // Three endpoints - payments, connect, identity - share one `StripeEvent` table.
    // A bare id is safe only while their Stripe event subscriptions are disjoint,
    // which is a configuration instruction enforced by nothing. Subscribe one
    // endpoint broadly while debugging and a real `checkout.session.completed`
    // delivered to two endpoints is claimed by whichever wins the race; if the wrong
    // one wins it matches no prefix, answers 200, and P1's handler then sees a
    // duplicate and does nothing. A real card charged, and a commande stuck at
    // PENDING_PAYMENT forever. A namespace makes the collision impossible instead of
    // documented.
    //
    // No migration and no backfill are needed, because `StripeEvent` was confirmed
    // at ZERO rows in production on 2026-08-17. That is only true once - it is
    // recorded here rather than left to be re-derived later.
    //
    // `payments.service.ts` deliberately still claims the bare id. P1's money path is
    // untouched by this branch, and changing its key would need its own migration
    // reasoning.
    const claimKey = `connect:${event.id}`;

    const claimed = await claimStripeEvent(this.prisma, claimKey, event.type);
    if (!claimed) return;

    try {
      switch (event.type) {
        case 'account.updated':
          await this.syncAccount(this.extractAccountId(event.object));
          return;
        default:
          // An unhandled type is not an error. Throwing would make Stripe retry it
          // for three days over an event we never subscribed to.
          return;
      }
    } catch (e) {
      // The claim is what makes a redelivery a no-op, so a failed action must give
      // it back - otherwise Stripe's retry is discarded as a duplicate and a
      // verified réparateur stays unpromoted permanently. Covers every case, not
      // just the one above.
      await this.prisma.stripeEvent
        .delete({ where: { id: claimKey } })
        .catch(() => undefined);
      throw e;
    }
  }

  /**
   * Reads Stripe's own record rather than trusting the event payload, then writes
   * the row. The event tells us WHICH account changed; Stripe tells us what it
   * changed to.
   *
   * This is the single writer of ConnectAccount state, which is what lets
   * `status()` be a pure read.
   */
  private async syncAccount(stripeAccountId: string): Promise<void> {
    if (!stripeAccountId) return;

    const row = await this.prisma.connectAccount.findUnique({
      where: { stripeAccountId },
      select: { id: true, userId: true, transfersActive: true },
    });
    // Not ours. Returning quietly is what stops Stripe retrying for three days
    // over an event we can do nothing with.
    if (!row) return;

    const account = await connectGateway().retrieveAccount(stripeAccountId);
    const now = new Date();

    await this.prisma.connectAccount.update({
      where: { id: row.id },
      data: {
        status: statusOf(account),
        entityType: account.entityType,
        transfersActive: account.transfersActive,
        disabledReason: account.disabledReason,
        // Never overwrite a known IBAN with « none »: a response without `external_accounts` says
        // nothing about the bank account.
        ...(account.ibanLast4 ? { ibanLast4: account.ibanLast4 } : {}),
        ...(account.ibanFingerprint ? { ibanFingerprint: account.ibanFingerprint } : {}),
        ...(account.detailsSubmitted ? { detailsSubmittedAt: now } : {}),
        lastSyncedAt: now,
      },
    });

    if (!row.transfersActive && account.transfersActive) {
      // Background execution since it might take a while for many stranded commandes
      this.commandesService.payoutStrandedCommandes(row.userId).catch((e) => {
        console.error('[connect] error starting stranded payout', row.userId, e);
      });
    }
  }

  /** Read the account id with type checking; never pass an untyped indexed value. */
  private extractAccountId(object: Record<string, unknown>): string {
    return typeof object?.id === 'string' ? object.id : '';
  }
}

/**
 * The four statuses, in precedence order. Rejection first, because a rejected
 * account also has no outstanding requirements and would otherwise read VERIFIED.
 */
function statusOf(account: ConnectAccountSummary): 'PENDING' | 'VERIFIED' | 'RESTRICTED' | 'REJECTED' {
  if (account.rejected) return 'REJECTED';
  if (account.transfersActive && !account.requirementsOutstanding) return 'VERIFIED';
  // Requirements outstanding on an account that never finished is PENDING; on one
  // that had finished it is RESTRICTED. `detailsSubmitted` is what distinguishes
  // "never got there" from "got there and slipped back".
  if (account.detailsSubmitted) return 'RESTRICTED';
  return 'PENDING';
}
