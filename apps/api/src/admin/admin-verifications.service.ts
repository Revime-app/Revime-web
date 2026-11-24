import { Injectable } from '@nestjs/common';
import {
  identityDecisionReasonFr,
  identityRowStatus,
  businessRowStatus,
  compareSiret,
  formatLegalForm,
  type AdminVerificationListItem,
  type AdminVerificationListQuery,
  type AdminVerificationListResponse,
  type AccountKind,
  type VerificationRowType,
  type VerificationRowStatus,
  type AdminBusinessDetailsResponse,
  type BusinessDecisionInput,
  type AdminVerificationAlert,
  type AdminVerificationAlertsResponse,
} from '@revime/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { maskIbanLast4 } from '../connect/iban-mask.js';
import { AppException } from '../common/app-exception.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { storageGateway } from '../storage/gateway.js';
import { businessDocumentBucket, legacyBusinessDocumentBucket } from '../business/document-bucket.js';
import { promoteToBusinessIfEligible } from '../verification/promote-business.js';
import { LIVE } from './admin-constants.js';
import { identityNeedsDecision } from './verification-needs-decision.js';
import { verificationKinds } from './verification-kinds.js';
import {
  PARTICULAR_QUOTA_ORDER_SELECT,
  isAtEightyPercentOfQuota,
  particularQuotaOrdersWhere,
  rollingQuotaWindowStart,
  summariseParticularQuota,
} from '../verification/particular-quota.js';
// Ruling R5 (fix round 1, CF4-21): reuse the ONE existing suffix rule rather than
// re-implement it here - `markerOf` is exported from admin-users.service.ts for
// exactly this reason (it has no other dependency on that file/module).
import { markerOf } from './admin-users.service.js';


/** What the A3 alerts read of a réparateur's account. Typed so the spec's fixtures cannot invent a column. */
export const ALERT_USER_SELECT = {
  id: true,
  name: true,
  firstName: true,
  lastName: true,
  birthDate: true,
  repairerProfile: { select: { kind: true } },
  fiscalDeclaration: { select: { nif: true, hasNoNif: true } },
  businessVerification: { select: { siret: true, siren: true, denomination: true, registrationProofName: true } },
  connectAccount: { select: { ibanLast4: true, ibanFingerprint: true } },
} satisfies Prisma.UserSelect;
export type AlertUser = Prisma.UserGetPayload<{ select: typeof ALERT_USER_SELECT }>;

@Injectable()
export class AdminVerificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications?: NotificationsService,
  ) {}

  /**
   * CF4-21 (spec §5). Replaces `AdminRepairersService.verificationQueue()`: instead of one
   * row per account (highest-precedence kind wins), this lists one row per VERIFICATION
   * (identity, business), so an operator sees both an identity problem and a business
   * problem on the same account rather than the queue's single winner hiding the other.
   */
  async list(query: Partial<AdminVerificationListQuery> = {}): Promise<AdminVerificationListResponse> {
    // ---- CF4-39 (spec §4.6): identity rows FIRST, because the profile population depends on them.
    // Today's population (level IDENTITY or BUSINESS only) hid exactly the stuck or failed BASIC
    // réparateur an operator would accept, and dropped a refused one. It is now every live
    // réparateur at IDENTITY/BUSINESS OR with an identity row (any level). `repairerEnabled` and
    // LIVE stay on the profile read, so a client with an identity row is still not listed.
    const identityRows = await this.prisma.identityVerification.findMany({
      select: {
        userId: true,
        stripeSessionId: true,
        status: true,
        verifiedAt: true,
        lastErrorCode: true,
        selfieFraudSignalAt: true,
        updatedAt: true,
        decision: true,
        decisionMotif: true,
        decisionNote: true,
        decidedAt: true,
        decidedByUserId: true,
      },
    });
    const deciderIds = [
      ...new Set(identityRows.map((r) => r.decidedByUserId).filter((id): id is string => id !== null)),
    ];

    // ---- Parallel reads, as `verificationQueue()` did. No `take` on the profile read:
    // the old queue's `take: 100` was ITS OWN cap (bounded a ranked-and-sliced result), but
    // this list must include every réparateur - the join can only ever shrink further reads,
    // never add profiles back, so capping the read would silently drop réparateurs from a
    // list whose whole point is completeness (brief: "the new list must include every
    // réparateur").
    const [profiles, businessRows, registryAttempts, deciders] = await Promise.all([
      this.prisma.profile.findMany({
        where: {
          repairerEnabled: true,
          OR: [
            { verificationLevel: { in: ['IDENTITY', 'BUSINESS'] } },
            { userId: { in: identityRows.map((r) => r.userId) } },
          ],
          ...LIVE,
        },
        select: {
          userId: true,
          verificationLevel: true,
          verifiedAt: true,
          updatedAt: true,
          user: {
            select: {
              email: true,
              name: true,
              username: true,
              repairerProfile: { select: { kind: true } },
            },
          },
        },
      }),

      this.prisma.businessVerification.findMany({
        select: { userId: true, siren: true, siret: true, status: true, verifiedAt: true, submittedAt: true, registrationProofName: true },
      }),

      // 🛑 REJECTED **OR** FAILED - see `verification-kinds.ts`'s header for why. Kept
      // verbatim from `verificationQueue()`.
      this.prisma.verificationAttempt.findMany({
        where: { channel: 'REGISTRY', outcome: { in: ['REJECTED', 'FAILED'] } },
        orderBy: { createdAt: 'desc' },
        select: { userId: true, target: true, createdAt: true, outcome: true },
      }),

      // One read for every decider's username (spec §4.6 panel: « author »).
      deciderIds.length > 0
        ? this.prisma.user.findMany({ where: { id: { in: deciderIds } }, select: { id: true, username: true } })
        : Promise.resolve([] as { id: string; username: string }[]),
    ]);
    const deciderName = new Map(deciders.map((d) => [d.id, d.username]));

    type IdentityRow = (typeof identityRows)[number];
    type BusinessRow = (typeof businessRows)[number];

    const identityByUser = new Map<string, IdentityRow>(identityRows.map((r) => [r.userId, r]));
    const businessByUser = new Map<string, BusinessRow>(businessRows.map((r) => [r.userId, r]));

    // Registry: only the LATEST failed-or-rejected attempt, and only if there's no
    // BusinessVerification since. Moved verbatim from `verificationQueue()`. The map's
    // `outcome` is narrowed to the two members the `where` clause guarantees at runtime -
    // TypeScript cannot see through a Prisma `where` filter to narrow `findMany`'s return
    // type on its own, so the narrowing is asserted once, here, rather than at every read.
    const registryRefusedByUser = new Map<
      string,
      { target: string; at: Date; outcome: 'REJECTED' | 'FAILED' }
    >();
    for (const attempt of registryAttempts) {
      if (registryRefusedByUser.has(attempt.userId)) continue; // Already have the latest
      const biz = businessByUser.get(attempt.userId);
      const bizAt = biz?.verifiedAt ?? biz?.submittedAt;
      if (!biz || (bizAt && attempt.createdAt > bizAt)) {
        registryRefusedByUser.set(attempt.userId, {
          target: attempt.target,
          at: attempt.createdAt,
          outcome: attempt.outcome as 'REJECTED' | 'FAILED',
        });
      }
    }

    const items: AdminVerificationListItem[] = [];

    for (const profile of profiles) {
      const identity = identityByUser.get(profile.userId) ?? null;
      const business = businessByUser.get(profile.userId) ?? null;
      const registryRefused = registryRefusedByUser.get(profile.userId) ?? null;

      const hits = verificationKinds(
        {
          profile: {
            userId: profile.userId,
            verificationLevel: profile.verificationLevel,
            verifiedAt: profile.verifiedAt,
            updatedAt: profile.updatedAt,
          },
          identity: identity
            ? {
                status: identity.status,
                verifiedAt: identity.verifiedAt,
                selfieFraudSignalAt: identity.selfieFraudSignalAt,
                updatedAt: identity.updatedAt,
              }
            : null,
          business: business ? { verifiedAt: business.verifiedAt ?? business.submittedAt } : null,
          registryRefused,
        },
        new Date(),
      );

      // Spec §5: `fraud_signal` and `identity_stuck` belong to the IDENTITY row.
      // `level_unbacked` belongs to IDENTITY when the profile level is IDENTITY, to
      // BUSINESS when BUSINESS (brief). `registry_refused` belongs to BUSINESS always.
      const identityHit = hits.find((h) => h.kind === 'fraud_signal' || h.kind === 'identity_stuck');
      const levelUnbackedHit = hits.find((h) => h.kind === 'level_unbacked');
      const registryHit = hits.find((h) => h.kind === 'registry_refused');

      const identityLevelUnbacked = profile.verificationLevel === 'IDENTITY' ? levelUnbackedHit : undefined;
      const businessLevelUnbacked = profile.verificationLevel === 'BUSINESS' ? levelUnbackedHit : undefined;

      const accountKind: AccountKind = profile.user.repairerProfile?.kind === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'PRO';
      // Ruling R5 (fix round 1, CF4-21): computed once per profile, same value on every
      // row for this account - reused from admin-users.service.ts's markerOf.
      const marker = markerOf(profile.user.email);

      // ---- IDENTITY row: one per IdentityVerification, else placed by a hit.
      const identityNeedsHit = identityHit ?? identityLevelUnbacked;
      if (identity) {
        const decision = identity.decision ?? null;
        const status = identityRowStatus({
          status: identity.status,
          verifiedAt: identity.verifiedAt,
          lastErrorCode: identity.lastErrorCode,
          decision,
        });
        // CF4-39 (spec §4.6): false once an operator decided; true again when a NEW session
        // fails, because start() clears the decision.
        const decided = decision !== null;
        const needsAction = identityNeedsDecision(identity);

        let identityDetail: string;
        if (decided) {
          if (decision === 'ACCEPTED') {
            identityDetail = identity.decisionNote ?? 'Acceptée manuellement par REVIME';
          } else {
            const reason = identityDecisionReasonFr(identity.decisionMotif ?? null, identity.decisionNote ?? null);
            identityDetail = reason ?? (decision === 'REFUSED' ? 'Refusée par REVIME' : 'Documents demandés par REVIME');
          }
        } else if (identity.selfieFraudSignalAt !== null) {
          identityDetail = 'Signal selfie / anomalie biométrique (Signal de fraude)';
        } else if (status === 'DOCUMENTS_REQUIRED') {
          identityDetail = 'Documents à refaire — justificatif non conforme ou illisible';
        } else if (status === 'PROCESSING') {
          identityDetail = 'Documents soumis — en attente de décision';
        } else if (status === 'NOT_STARTED') {
          identityDetail = 'En attente de transmission des documents';
        } else if (status === 'VERIFIED') {
          identityDetail = 'Identité vérifiée avec succès';
        } else if (status === 'CANCELED') {
          identityDetail = "Session annulée par l'utilisateur";
        } else if (status === 'FAILED') {
          identityDetail = 'Échec technique lors de la vérification';
        } else {
          identityDetail = identityNeedsHit?.detail ?? 'En cours de vérification';
        }

        items.push({
          id: `${profile.userId}:IDENTITY`,
          userId: profile.userId,
          date: identity.updatedAt.toISOString(),
          displayName: profile.user.name,
          username: profile.user.username,
          email: profile.user.email,
          accountKind,
          type: 'IDENTITY',
          status,
          needsAction,
          detail: identityDetail,
          siren: null,
          siret: null,
          marker,
          identity: {
            stripeStatus: identity.status,
            stripeSessionId: identity.stripeSessionId ?? null,
            lastErrorCode: identity.lastErrorCode,
            fraudSignal: identity.selfieFraudSignalAt !== null,
            decision,
            motif: identity.decisionMotif ?? null,
            note: identity.decisionNote ?? null,
            decidedAt: identity.decidedAt?.toISOString() ?? null,
            decidedBy: identity.decidedByUserId ? (deciderName.get(identity.decidedByUserId) ?? null) : null,
          },
        });
      } else if (identityNeedsHit) {
        // Placement: no IdentityVerification row exists, but a hit belongs to IDENTITY -
        // create the row NOT_STARTED, date = the hit's `at`, needsAction false (cannot decide),
        // detail = the hit's sentence (brief).
        items.push({
          id: `${profile.userId}:IDENTITY`,
          userId: profile.userId,
          date: identityNeedsHit.at.toISOString(),
          displayName: profile.user.name,
          username: profile.user.username,
          email: profile.user.email,
          accountKind,
          type: 'IDENTITY',
          status: 'NOT_STARTED',
          needsAction: false,
          detail: identityNeedsHit.detail,
          siren: null,
          siret: null,
          marker,
          identity: null,
        });
      }

      // ---- BUSINESS row(s): one row per BusinessVerification, one REJECTED/FAILED
      // per registry-only attempt, else placed by level_unbacked at BUSINESS.
      const businessNeedsHit = registryHit ?? businessLevelUnbacked;
      if (business) {
        const rawStatus = business.status;
        const status: VerificationRowStatus =
          rawStatus === 'APPROVED'
            ? businessRowStatus('VERIFIED')
            : rawStatus === 'REJECTED'
              ? businessRowStatus('REJECTED')
              : rawStatus === 'DOCUMENTS_REQUIRED'
                ? 'DOCUMENTS_REQUIRED'
                : 'PROCESSING';
        // An operator can decide on a dossier that is submitted (PENDING) or flagged by the registry. A
        // DOCUMENTS_REQUIRED one waits on the réparateur. The dashboard counts PENDING by the same rule
        // (`BUSINESS_NEEDS_DECISION_WHERE`); only the registry flag is list-only.
        const needsAction = rawStatus === 'PENDING' || businessNeedsHit !== undefined;

        const mismatchResult = business.registrationProofName
          ? compareSiret({
              filename: business.registrationProofName,
              declaredSiret: business.siret ?? null,
              declaredSiren: business.siren ?? null,
            })
          : null;
        const hasSiretMismatch = mismatchResult?.mismatch ?? false;

        let businessDetail: string;
        if (businessNeedsHit) {
          businessDetail = businessNeedsHit.detail;
        } else if (hasSiretMismatch) {
          businessDetail = 'Écart détecté entre SIRET déclaré et justificatif';
        } else if (rawStatus === 'APPROVED' || status === 'VERIFIED') {
          businessDetail = 'Établissement vérifié au registre des entreprises';
        } else if (rawStatus === 'DOCUMENTS_REQUIRED' || status === 'DOCUMENTS_REQUIRED') {
          businessDetail = 'Pièces complémentaires demandées au réparateur';
        } else if (rawStatus === 'REJECTED' || status === 'REJECTED' || status === 'FAILED') {
          businessDetail = 'SIRET non trouvé ou entreprise fermée au registre';
        } else if (status === 'NOT_STARTED') {
          businessDetail = 'En attente de transmission du SIRET';
        } else if (rawStatus === 'PENDING' || status === 'PROCESSING') {
          businessDetail = 'Avis de situation SIRET déposé — en attente de décision';
        } else {
          businessDetail = 'Dossier entreprise en cours';
        }

        items.push({
          id: `${profile.userId}:BUSINESS`,
          userId: profile.userId,
          date: (business.verifiedAt ?? business.submittedAt).toISOString(),
          displayName: profile.user.name,
          username: profile.user.username,
          email: profile.user.email,
          accountKind,
          type: 'BUSINESS',
          status,
          needsAction,
          detail: businessDetail,
          siren: business.siren,
          siret: business.siret,
          marker,
          identity: null,
        });
      } else if (registryHit) {
        // Registry-only row: no BusinessVerification, latest REJECTED/FAILED attempt.
        // siren = the attempt's `target` (typed SIREN).
        //
        // `registryRefused` is narrowed locally rather than asserted with `!`: `registryHit`
        // can only be truthy when `verificationKinds()` derived it FROM this same
        // `registryRefused` value for this profile (see the hits computation above), but
        // that link crosses two files, so a local narrowing keeps this branch provably safe
        // on its own rather than trusting an invariant the type checker cannot see (review,
        // Minor).
        if (!registryRefused) {
          throw new Error('registryHit implies registryRefused for the same profile');
        }
        items.push({
          id: `${profile.userId}:BUSINESS`,
          userId: profile.userId,
          date: registryHit.at.toISOString(),
          displayName: profile.user.name,
          username: profile.user.username,
          email: profile.user.email,
          accountKind,
          type: 'BUSINESS',
          status: businessRowStatus(registryRefused.outcome === 'FAILED' ? 'FAILED' : 'REJECTED'),
          needsAction: false,
          detail: registryHit.detail,
          siren: registryRefused.target,
          siret: null,
          marker,
          identity: null,
        });
      } else if (businessLevelUnbacked) {
        // Placement: BUSINESS level, no BusinessVerification, no registry hit either -
        // create the row NOT_STARTED, date = the hit's `at`, needsAction false.
        items.push({
          id: `${profile.userId}:BUSINESS`,
          userId: profile.userId,
          date: businessLevelUnbacked.at.toISOString(),
          displayName: profile.user.name,
          username: profile.user.username,
          email: profile.user.email,
          accountKind,
          type: 'BUSINESS',
          status: 'NOT_STARTED',
          needsAction: false,
          detail: businessLevelUnbacked.detail,
          siren: null,
          siret: null,
          marker,
          identity: null,
        });
      }
    }

    // ---- Filters, applied in memory. Spec §2 F6: the row's status and needsAction are
    // DERIVED (need the join above, not a stored column), so - like the shipments and
    // refunds lists - they are filtered in memory after the reads, before pagination. The
    // population here is smaller still (réparateurs only, ~21 today), so an in-memory
    // filter costs nothing measurable.
    let filtered = items;

    if (query.status) {
      filtered = filtered.filter((i) => i.status === query.status);
    }
    // needsAction defaults to true (the query schema already defaults it to 'true').
    // Bug B6: When needsAction is 'true', filter only items where an admin needs to decide.
    // When needsAction is 'false' (filter off = "Tous"), do not filter by needsAction (show all items).
    const needsActionFilter = query.needsAction ?? 'true';
    if (needsActionFilter === 'true') {
      filtered = filtered.filter((i) => i.needsAction);
    }
    if (query.accountKind) {
      filtered = filtered.filter((i) => i.accountKind === query.accountKind);
    }
    if (query.type) {
      filtered = filtered.filter((i) => i.type === (query.type as VerificationRowType));
    }
    if (query.from) {
      const from = new Date(query.from).getTime();
      filtered = filtered.filter((i) => new Date(i.date).getTime() >= from);
    }
    if (query.to) {
      const to = new Date(query.to).getTime();
      filtered = filtered.filter((i) => new Date(i.date).getTime() <= to);
    }
    if (query.user) {
      const needle = query.user.toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.username.toLowerCase().includes(needle) ||
          i.displayName.toLowerCase().includes(needle) ||
          i.email.toLowerCase().includes(needle),
      );
    }
    if (query.siren) {
      const needle = query.siren.toLowerCase();
      filtered = filtered.filter(
        (i) => (i.siren?.toLowerCase().includes(needle) ?? false) || (i.siret?.toLowerCase().includes(needle) ?? false),
      );
    }

    // P8: sortOrder by age.
    // When needsAction is active (default), sort oldest first ('asc') to clear backlog chronologically.
    // When needsAction is false ("Tous"), default to newest first ('desc').
    // If explicitly specified, query.sortOrder takes precedence.
    const sortOrder = query.sortOrder ?? (query.needsAction === 'false' ? 'desc' : 'asc');
    filtered = filtered.sort((a, b) =>
      sortOrder === 'asc'
        ? new Date(a.date).getTime() - new Date(b.date).getTime()
        : new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, query.pageSize ?? 25);
    const total = filtered.length;
    const skip = (page - 1) * pageSize;
    const pageItems = filtered.slice(skip, skip + pageSize);

    return { items: pageItems, total, page, pageSize };
  }

  /**
   * CF5-07. Detailed inspection of a repairer's business verification submission,
   * including signed document read URLs (15-min TTL) and side-by-side identity comparison.
   */
  async getBusinessDetails(targetUserId: string): Promise<AdminBusinessDetailsResponse> {
    const business = await this.prisma.businessVerification.findUnique({
      where: { userId: targetUserId },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            firstName: true,
            lastName: true,
            image: true,
            profile: {
              select: {
                avatarPath: true,
              },
            },
          },
        },
      },
    });

    if (!business || !business.user) {
      throw new AppException('NOT_FOUND', 'Vérification introuvable.');
    }

    const paths: string[] = [];
    if (business.registrationProofPath) {
      paths.push(business.registrationProofPath);
    }
    if (business.insuranceProofPath) {
      paths.push(business.insuranceProofPath);
    }

    const signedUrls =
      paths.length > 0
        ? await storageGateway().createSignedReadUrls(paths, 900, businessDocumentBucket())
        : new Map<string, string>();
    // V7 A4: a document submitted before the dedicated bucket is still in `attachments`.
    const unsigned = paths.filter((p) => !signedUrls.has(p));
    if (unsigned.length > 0) {
      const legacy = await storageGateway().createSignedReadUrls(unsigned, 900, legacyBusinessDocumentBucket());
      for (const [p, url] of legacy) signedUrls.set(p, url);
    }

    const decider = business.decidedByUserId
      ? await this.prisma.user.findUnique({
          where: { id: business.decidedByUserId },
          select: { email: true },
        })
      : null;

    const verifiedIdentityName =
      [business.user.firstName, business.user.lastName].filter(Boolean).join(' ').trim() ||
      business.user.name ||
      null;

    const avatarUrl = business.user.image ?? business.user.profile?.avatarPath ?? null;

    return {
      userId: targetUserId,
      user: {
        name: business.user.name,
        email: business.user.email,
        avatarUrl,
        verifiedIdentityName,
      },
      business: {
        siren: business.siren,
        siret: business.siret,
        denomination: business.denomination,
        legalForm: business.legalForm ? formatLegalForm(business.legalForm) : business.legalForm,
        establishmentAddress: business.establishmentAddress,
        vatNumber: business.vatNumber,
        dirigeantName: business.dirigeantName,
        registrationProof: {
          name: business.registrationProofName,
          sizeBytes: business.registrationProofSizeBytes,
          url: signedUrls.get(business.registrationProofPath) ?? '',
        },
        insuranceProof: business.insuranceProofPath
          ? {
              name: business.insuranceProofName ?? '',
              sizeBytes: business.insuranceProofSizeBytes ?? 0,
              url: signedUrls.get(business.insuranceProofPath) ?? '',
            }
          : null,
        status: business.status,
        submittedAt: business.submittedAt.toISOString(),
        verifiedAt: business.verifiedAt ? business.verifiedAt.toISOString() : null,
      },
      decision:
        business.decisionMotif && business.decidedAt
          ? {
              motif: business.decisionMotif,
              note: business.decisionNote,
              decidedAt: business.decidedAt.toISOString(),
              decidedByEmail: decider?.email ?? null,
            }
          : null,
    };
  }

  /**
   * CF5-07. Validates business verification, sets status to APPROVED, promotes profile to BUSINESS,
   * and emits a BUSINESS_VERIFIED notification.
   */
  async approveBusiness(adminUserId: string, targetUserId: string): Promise<{ success: true }> {
    const business = await this.prisma.businessVerification.findUnique({
      where: { userId: targetUserId },
    });
    if (!business) {
      throw new AppException('NOT_FOUND', 'Vérification introuvable.');
    }
    // V7 A4 (`Q-12`): a row older than migration 20261003020000 has `registrationProofPath = ''`,
    // and one was approved with no document at all on 2026-10-27.
    if (!business.registrationProofPath.trim()) {
      throw new AppException(
        'UNPROCESSABLE_ENTITY',
        "Aucun justificatif d'immatriculation n'est enregistré : demandez les documents au réparateur.",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.businessVerification.update({
        where: { userId: targetUserId },
        data: {
          status: 'APPROVED',
          verifiedAt: new Date(),
          decidedAt: new Date(),
          decidedByUserId: adminUserId,
          decisionMotif: null,
          decisionNote: null,
        },
      });
      await promoteToBusinessIfEligible(tx, targetUserId);
    });

    await this.notifications?.emit({
      userId: targetUserId,
      mode: 'REPAIRER',
      type: 'BUSINESS_VERIFIED',
      actorName: 'REVIME',
    });

    return { success: true };
  }

  /**
   * CF5-07. Refuses business verification with motif and optional note, demotes profile to IDENTITY,
   * and emits a BUSINESS_REFUSED notification.
   */
  async refuseBusiness(
    adminUserId: string,
    targetUserId: string,
    input: BusinessDecisionInput,
  ): Promise<{ success: true }> {
    const business = await this.prisma.businessVerification.findUnique({
      where: { userId: targetUserId },
    });
    if (!business) {
      throw new AppException('NOT_FOUND', 'Vérification introuvable.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.businessVerification.update({
        where: { userId: targetUserId },
        data: {
          status: 'REJECTED',
          decisionMotif: input.motif,
          decisionNote: input.note?.trim() || null,
          decidedAt: new Date(),
          decidedByUserId: adminUserId,
          verifiedAt: null,
        },
      });
      await tx.profile.updateMany({
        where: { userId: targetUserId, verificationLevel: 'BUSINESS' },
        data: { verificationLevel: 'IDENTITY' },
      });
    });

    await this.notifications?.emit({
      userId: targetUserId,
      mode: 'REPAIRER',
      type: 'BUSINESS_REFUSED',
      actorName: 'REVIME',
    });

    return { success: true };
  }

  /**
   * CF5-07. Requests new documents with motif and optional note, demotes profile to IDENTITY,
   * and emits a BUSINESS_DOCUMENTS_REQUIRED notification.
   */
  async requestBusinessDocuments(
    adminUserId: string,
    targetUserId: string,
    input: BusinessDecisionInput,
  ): Promise<{ success: true }> {
    const business = await this.prisma.businessVerification.findUnique({
      where: { userId: targetUserId },
    });
    if (!business) {
      throw new AppException('NOT_FOUND', 'Vérification introuvable.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.businessVerification.update({
        where: { userId: targetUserId },
        data: {
          status: 'DOCUMENTS_REQUIRED',
          decisionMotif: input.motif,
          decisionNote: input.note?.trim() || null,
          decidedAt: new Date(),
          decidedByUserId: adminUserId,
          verifiedAt: null,
        },
      });
      await tx.profile.updateMany({
        where: { userId: targetUserId, verificationLevel: 'BUSINESS' },
        data: { verificationLevel: 'IDENTITY' },
      });
    });

    await this.notifications?.emit({
      userId: targetUserId,
      mode: 'REPAIRER',
      type: 'BUSINESS_DOCUMENTS_REQUIRED',
      actorName: 'REVIME',
    });

    return { success: true };
  }

  /**
   * A3. The alerts of /verifications (the client's brief, page 9). Six rules, each fed by data that
   * exists:
   * 1. MALFORMED_NIF: 13 digits starting with 0, 1, 2 or 3.
   * 2. DUPLICATE_IBAN: the same Stripe bank-account fingerprint on several accounts. NOT the last four
   *    digits: they identify nothing. An account that has not synced a bank account yet has none.
   * 3. DUPLICATE_NIF: the same NIF on several accounts (shown masked).
   * 4. NO_NIF_OVER_25: « pas de NIF » ticked by a person more than 25 years old.
   * 5. PARTICULAR_QUOTA_80_PERCENT: an individual at 8 missions or 1 200 EUR over 12 months, counted as
   *    the user page counts (`particular-quota.ts`).
   * 6. SIRET_MISMATCH: B4's rule.
   *
   * 🛑 « Nom ou date de naissance différents de Stripe Identity » is NOT built: names and dates of
   * birth are declared by the réparateur and nothing reads Stripe Identity's verified outputs back
   * (`ISS-052`). The rule used to exist and read four columns the schema does not have, so it never fired.
   */
  async getAlerts(): Promise<AdminVerificationAlertsResponse> {
    const alerts: AdminVerificationAlert[] = [];
    const now = new Date();

    const users = await this.prisma.user.findMany({
      where: { repairerProfile: { isNot: null }, profile: { deletedAt: null } },
      select: ALERT_USER_SELECT,
    });
    const alertOf = (
      u: AlertUser,
      kind: Pick<AdminVerificationAlert, 'type' | 'severity' | 'title' | 'detail'> & { idPart?: string },
    ): AdminVerificationAlert => ({
      id: `${kind.type.toLowerCase().replace(/_/g, '-')}-${kind.idPart ?? u.id}`,
      type: kind.type,
      severity: kind.severity,
      title: kind.title,
      detail: kind.detail,
      userId: u.id,
      userName: getUserDisplayName(u),
      userHref: `/utilisateurs/${u.id}`,
    });

    for (const u of users) {
      const declaration = u.fiscalDeclaration;
      if (declaration && !declaration.hasNoNif && declaration.nif) {
        const nif = declaration.nif.replace(/\s+/g, '');
        if (!/^[0-3]\d{12}$/.test(nif)) {
          alerts.push(
            alertOf(u, {
              type: 'MALFORMED_NIF',
              severity: 'CRITICAL',
              title: `NIF mal formé · ${getUserDisplayName(u)}`,
              detail: `« ${nif} » : 13 chiffres attendus, commençant par 0, 1, 2 ou 3.`,
            }),
          );
        }
      }
    }

    const byFingerprint = groupBy(users, (u) => u.connectAccount?.ibanFingerprint);
    for (const group of byFingerprint.values()) {
      if (group.length < 2) continue;
      const first = group[0]!;
      const names = formatNamesFrench(group.map(getUserDisplayName));
      alerts.push({
        ...alertOf(first, {
          type: 'DUPLICATE_IBAN',
          severity: 'CRITICAL',
          title: `Même IBAN sur ${group.length} comptes · ${names}`,
          detail: `${maskIbanLast4(first.connectAccount?.ibanLast4) ?? 'IBAN'} utilisé par ${countWordFr(group.length)} réparateurs.`,
          idPart: group.map((m) => m.id).sort().join('-'),
        }),
        userName: names,
      });
    }

    const byNif = groupBy(users, (u) =>
      u.fiscalDeclaration && !u.fiscalDeclaration.hasNoNif ? u.fiscalDeclaration.nif?.replace(/\s+/g, '') : null,
    );
    for (const [nif, group] of byNif) {
      if (group.length < 2) continue;
      const first = group[0]!;
      const names = formatNamesFrench(group.map(getUserDisplayName));
      alerts.push({
        ...alertOf(first, {
          type: 'DUPLICATE_NIF',
          severity: 'CRITICAL',
          title: `Même NIF sur ${group.length} comptes · ${names}`,
          // Masked: every staff role reads this list, and the full number is on the fiche of the roles allowed it.
          detail: `NIF « •••• ${nif.slice(-3)} » utilisé par ${countWordFr(group.length)} réparateurs.`,
          idPart: group.map((m) => m.id).sort().join('-'),
        }),
        userName: names,
      });
    }

    for (const u of users) {
      if (!u.fiscalDeclaration?.hasNoNif || !u.birthDate) continue;
      const age = ageInYears(u.birthDate, now);
      if (age > 25) {
        alerts.push(
          alertOf(u, {
            type: 'NO_NIF_OVER_25',
            severity: 'WARNING',
            title: `« Pas de NIF » coché, ${age} ans · ${getUserDisplayName(u)}`,
            detail: 'À vérifier : demander un justificatif.',
          }),
        );
      }
    }

    const individualIds = users.filter((u) => u.repairerProfile?.kind === 'INDIVIDUAL').map((u) => u.id);
    if (individualIds.length > 0) {
      const orders = await this.prisma.commande.findMany({
        where: particularQuotaOrdersWhere(individualIds, rollingQuotaWindowStart(now)),
        select: PARTICULAR_QUOTA_ORDER_SELECT,
      });
      const ordersByUser = groupBy(orders, (o) => o.repairerUserId);
      for (const u of users) {
        const figures = summariseParticularQuota(ordersByUser.get(u.id) ?? []);
        if (!isAtEightyPercentOfQuota(figures)) continue;
        const { missionsCount, amountCollectedCents } = figures;
        alerts.push(
          alertOf(u, {
            type: 'PARTICULAR_QUOTA_80_PERCENT',
            severity: 'WARNING',
            title: `80 % du plafond particulier · ${getUserDisplayName(u)}`,
            detail: `${missionsCount} mission${missionsCount > 1 ? 's' : ''} et ${formatAlertEuros(amountCollectedCents)} sur 12 mois.`,
          }),
        );
      }
    }

    for (const u of users) {
      const business = u.businessVerification;
      if (!business?.registrationProofName) continue;
      const mismatch = compareSiret({
        filename: business.registrationProofName,
        declaredSiret: business.siret,
        declaredSiren: business.siren,
      });
      if (!mismatch?.mismatch) continue;
      const displayName = business.denomination || getUserDisplayName(u);
      alerts.push({
        ...alertOf(u, {
          type: 'SIRET_MISMATCH',
          severity: 'CRITICAL',
          title: `Discordance SIRET justificatif · ${displayName}`,
          detail: `SIRET déclaré ${mismatch.declaredSiret}, extrait du document ${mismatch.extractedSiret}.`,
        }),
        userName: displayName,
      });
    }

    return { alerts, totalCount: alerts.length };
  }
}

/** The accounts under each key; an account whose key is empty belongs to no group. */
function groupBy<T>(items: readonly T[], keyOf: (item: T) => string | null | undefined): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

/** Whole years on `now`, reading the stored date in UTC: dates of birth are stored as UTC noon. */
function ageInYears(birthDate: Date, now: Date): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birthDate.getUTCMonth() ||
    (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age--;
  return age;
}

function countWordFr(count: number): string {
  return count === 2 ? 'deux' : String(count);
}

function getUserDisplayName(u: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  if (u.name && u.name.trim()) return u.name.trim();
  const joined = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return joined || 'Réparateur';
}

function formatNamesFrench(names: string[]): string {
  if (names.length === 0) return 'Réparateur';
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} et ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

/** Whole euros with a plain space between thousands, as the mockup writes them (`Intl` picks a narrow no-break space that varies with the ICU build). */
function formatAlertEuros(cents: number): string {
  return `${String(Math.round(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`;
}

