import { Injectable } from '@nestjs/common';
import type {
  AdminRegistryLookupResult,
  AdminRepairerBlock,
} from '@revime/shared';
import { verifiedBadgeFor } from '@revime/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { isRepairerSuspended } from './admin-constants.js';
import { registryGateway, type RegistryCompany } from '../business/gateway.js';
import { AppException } from '../common/app-exception.js';
import { LIVE_OFFER_WHERE, ACCEPTABLE_OFFER_WHERE } from '../offers/offer-predicates.js';

/**
 * §8.3's read surfaces. Task 8's block and registry lookup. The verification queue that
 * used to live here (`verificationQueue()`) was removed by CF4-21 (spec §5) - its four rules
 * moved, verbatim, to the pure `verificationKinds()` in `verification-kinds.ts`, and its
 * read/join/shaping logic was rewritten as `AdminVerificationsService.list()`, which lists
 * one row per verification instead of one row per account. `admin-verification-queue.spec.ts`
 * was replaced by `test/verification-kinds.spec.ts` and `test/admin-verifications-list.spec.ts`.
 *
 * 🛑 `@Injectable()` IS LOAD-BEARING AND ITS ABSENCE IS SILENT. TypeScript emits
 * `design:paramtypes` only for a class carrying at least one decorator, so without it Nest sees
 * no declared dependencies, raises NO resolution error, and calls `new AdminRepairersService()`
 * - the app boots and `this.prisma` is `undefined`. This class shipped without the decorator,
 * and because `AdminUsersService.detail()` awaits `repairerBlock()` unconditionally, every
 * `GET /admin/users/:id` answered 500 for client and réparateur alike, which removed every
 * §8.2 and §8.3 write control from the operator. `admin-module-di.spec.ts` is the gate.
 */
@Injectable()
export class AdminRepairersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * §8.3's repairer block on the user fiche.
   *
   * 🛑 NULL IN THREE CASES, NOT ONE, AND THIS COMMENT USED TO NAME ONLY THE FIRST: no
   * `RepairerProfile` row; réparateur mode off **with no suspension recorded**; and no such
   * user. « has never enabled réparateur mode » was never the condition the code tested -
   * `repairerEnabled` is the CURRENT state, so the block also vanished for anyone who turned
   * the mode off, which is how the state below became unrecoverable.
   *
   * 🛑 A SUSPENSION OUTRANKS THE MODE FLAG, and the reason is a hole a moderation target could
   * reach himself. Guard 7 (`users.service.ts`) refuses only `false → true`, so a suspended
   * réparateur may turn the mode OFF - deliberately permitted, so he is never trapped in
   * réparateur mode. But then `repairerEnabled` is false, so this method used to return null,
   * so `RepairerBlock.tsx` rendered NOTHING - including no « Réactiver le mode réparateur »
   * button - and `AdminUserDetail` carries no suspension columns of its own. The operator saw
   * nothing at all about a live suspension, the account vanished from `?type=reparateur`, and
   * recovery existed only as a hand-crafted API call. So the block is returned whenever
   * `repairerSuspendedAt` is set, whatever `repairerEnabled` says.
   *
   * `repairerEnabled` is on the DTO for the same reason: without it the operator reads a
   * suspension block that looks live and cannot tell that reactivating alone will not return
   * him to the directory, because the mode is his own to switch back on.
   *
   * 🛑 publicBadge MUST go through verifiedBadgeFor, never a local `level === 'IDENTITY'`
   * test. That function is the ONE derivation of a public trust badge from a level, and
   * the whole point of the field is that the operator sees exactly what a client sees.
   *
   * 🛑 identity is Stripe's OUTCOME only - never the document. We deliberately never store
   * the document, so there is nothing to show. Render status, verifiedAt, lastErrorCode,
   * variant, redactionStatus, erasureRequestedAt, selfieFraudSignalAt.
   *
   * 🛑 counts.hiddenLiveOffers = count under LIVE_OFFER_WHERE minus count under
   * ACCEPTABLE_OFFER_WHERE. This is the only place in the product that shows how many
   * offers a suspension is hiding, so it is worth a test of its own.
   *
   * 🛑 connectStatus is read-only with a comment saying acting on it is §8.6's, i.e. piece
   * D's. Three ConnectAccount rows are PENDING in production - réparateurs who cannot be
   * paid - so the operator must see it without this piece growing a payments action.
   *
   * 🛑 repairerSuspendedUntil is display-only and deliberately does NOT self-expire. A
   * suspension ends only when an operator clears repairerSuspendedAt. The block's
   * suspension.until carries the date as the operator's recorded intent, not a mechanism.
   * Task 10 renders it WITHOUT implying self-expiry.
   */
  async repairerBlock(userId: string): Promise<AdminRepairerBlock | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        repairerProfile: {
          select: {
            displayName: true,
            kind: true,
            bio: true,
            postalCode: true,
            serviceAreaLabel: true,
            serviceRadiusKm: true,
          },
        },
        profile: {
          select: {
            deletedAt: true,
            repairerEnabled: true,
            verificationLevel: true,
            repairerSuspendedAt: true,
            repairerSuspendedUntil: true,
            repairerSuspendedReason: true,
            verificationRevokedAt: true,
            verificationRevokedReason: true,
          },
        },
        identityVerification: {
          select: {
            id: true,
            createdAt: true,
            stripeSessionId: true,
            status: true,
            verifiedAt: true,
            lastErrorCode: true,
            variant: true,
            redactionStatus: true,
            erasureRequestedAt: true,
            selfieFraudSignalAt: true,
          },
        },
        businessVerification: {
          select: {
            siren: true,
            siret: true,
            denomination: true,
            establishmentAddress: true,
            etatAdministratif: true,
            verifiedAt: true,
            submittedAt: true,
          },
        },
        connectAccount: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!user) return null;
    if (!user.profile) return null;

    const isDeleted = user.profile.deletedAt != null;

    // 🛑 The suspension clause is what makes the state above recoverable. Do not collapse this
    // back into `if (!user.profile.repairerEnabled) return null`.
    //
    // 🛑 THROUGH `isRepairerSuspended`, never an inline `=== null`. It is the one form of « le
    // mode réparateur est suspendu », and its loose `!= null` is load-bearing: a strict test
    // would read an ABSENT `repairerSuspendedAt` as a live suspension and return a block for an
    // account that has no réparateur side at all.
    //
    // 🛑 Bug B13: A deleted repairer account has repairerEnabled: false, but must still render
    // its historical repairer profile, business registry, and identity outcome in the admin fiche.
    if (!user.profile.repairerEnabled && !isRepairerSuspended(user.profile) && !isDeleted) return null;
    if (!user.repairerProfile) return null;

    // 🛑 Two separate offer counts: LIVE_OFFER_WHERE and ACCEPTABLE_OFFER_WHERE. The
    // difference is how many offers a suspension is hiding, which is the one number no
    // client-facing surface shows. This is the reason the block exists.
    const [liveOffers, acceptableOffers] = await Promise.all([
      this.prisma.offer.count({
        where: { ...LIVE_OFFER_WHERE, repairerUserId: userId },
      }),
      this.prisma.offer.count({
        where: { ...ACCEPTABLE_OFFER_WHERE, repairerUserId: userId },
      }),
    ]);

    // Bug B13: what Stripe erasure shows is what we stored. The cron settles a stuck PROCESSING
    // from Stripe's own report (`CronService.settlePendingErasures`); a read neither guesses nor writes.
    const identityRedactionStatus = user.identityVerification?.redactionStatus ?? null;
    const identityStatus = user.identityVerification?.status ?? null;

    return {
      displayName: user.repairerProfile.displayName,
      kind: user.repairerProfile.kind,
      bio: user.repairerProfile.bio,
      postalCode: user.repairerProfile.postalCode,
      serviceAreaLabel: user.repairerProfile.serviceAreaLabel,
      serviceRadiusKm: user.repairerProfile.serviceRadiusKm,
      // 🛑 CURRENT state, and false is reachable WITH a suspension set - see the header. The
      // fiche renders it so the operator is not left reading a block that looks live.
      repairerEnabled: isDeleted ? false : user.profile.repairerEnabled,
      // 🛑 Bug B13: A deleted user retains no active public verification badge.
      publicBadge: isDeleted ? null : verifiedBadgeFor(user.profile.verificationLevel),
      suspension: user.profile.repairerSuspendedAt
        ? {
            at: user.profile.repairerSuspendedAt.toISOString(),
            until: user.profile.repairerSuspendedUntil?.toISOString() ?? null,
            reason: user.profile.repairerSuspendedReason,
          }
        : null,
      revocation: user.profile.verificationRevokedAt
        ? {
            at: user.profile.verificationRevokedAt.toISOString(),
            reason: user.profile.verificationRevokedReason,
          }
        : null,
      // 🛑 Stripe's OUTCOME only, never the document. We deliberately never store it.
      identity: user.identityVerification
        ? {
            status: identityStatus ?? user.identityVerification.status,
            verifiedAt: user.identityVerification.verifiedAt?.toISOString() ?? null,
            lastErrorCode: user.identityVerification.lastErrorCode,
            variant: user.identityVerification.variant,
            redactionStatus: identityRedactionStatus,
            erasureRequestedAt: user.identityVerification.erasureRequestedAt?.toISOString() ?? null,
            selfieFraudSignalAt: user.identityVerification.selfieFraudSignalAt?.toISOString() ?? null,
          }
        : null,
      business: user.businessVerification
        ? {
            siren: user.businessVerification.siren,
            siret: user.businessVerification.siret,
            denomination: user.businessVerification.denomination,
            establishmentAddress: user.businessVerification.establishmentAddress,
            etatAdministratif: user.businessVerification.etatAdministratif ?? 'A',
            verifiedAt: (user.businessVerification.verifiedAt ?? user.businessVerification.submittedAt).toISOString(),
          }
        : null,
      // 🛑 READ-ONLY. Acting on it is §8.6's, i.e. piece D's. Three ConnectAccount rows
      // are PENDING in production - réparateurs who cannot be paid - so the operator must
      // see it without this piece growing a payments action.
      connectStatus: user.connectAccount?.status ?? null,
      counts: {
        liveOffers,
        hiddenLiveOffers: liveOffers - acceptableOffers,
      },
    };
  }

  /**
   * §8.3's « Vérifier les numéros SIREN / SIRET ». The ask's verb is CHECK, so this reads
   * and returns; it writes nothing and promotes nobody (decision 5).
   *
   * 🛑 NO RATE LIMIT, AND THAT IS A STATED LIMIT RATHER THAN AN OMISSION.
   * checkRegistryLimit counts VerificationAttempt rows keyed on the SIREN, so limiting the
   * operator would mean writing one - and an operator checking a company 20 times would
   * consume MAX_REGISTRY_LOOKUPS_PER_SIREN_PER_DAY and lock out the réparateur who owns it.
   * rate-limit.ts:147-149 forbids exactly that. Acceptable while there is ONE admin account
   * behind AdminRoleGuard and the registry is a free public API. It must never be reused for
   * anything billed, and a second admin account is the trigger to revisit it.
   *
   * A GET, so admin-audit-coverage.spec.ts does not require an @Audit action. The
   * alternative - a POST with an audit row, giving the operator's third-party queries a
   * trail - was considered and rejected because this queries a PUBLIC registry and writes
   * nothing. Spec §4.3.
   */
  async registryLookup(siren: string): Promise<AdminRegistryLookupResult> {
    let company: RegistryCompany | null;
    try {
      company = await registryGateway().lookup({ siren, siret: null });
    } catch (error) {
      console.warn('[admin] registry lookup failed', error);
      // Its own message. « aucune entreprise ne correspond » would tell the operator the
      // company does not exist, which is a different and unestablished claim.
      throw new AppException('SERVICE_UNAVAILABLE', 'Le registre est indisponible. Réessayez plus tard.');
    }
    if (!company) return { found: false };

    // Mapped FIELD BY FIELD rather than spread, so a rename in RegistryCompany becomes a
    // compile error here instead of a silently missing key in the operator's view. Read
    // gateway.ts:21-38 for the two source types before editing this.
    return {
      found: true,
      siren: company.siren,
      siret: company.siret,
      denomination: company.denomination,
      establishmentAddress: company.establishmentAddress,
      etatAdministratif: company.etatAdministratif,
      diffusible: company.diffusible,
      officers: company.dirigeants.map((o) => ({
        nom: o.nom,
        prenoms: o.prenoms,
        qualite: o.qualite,
      })),
    };
  }
}
