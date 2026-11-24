import type { BusinessVerificationStatus } from './business.schemas.js';
import type { IdentityStatus } from './identity.schemas.js';
import type { MeResponse } from './user.schemas.js';

/**
 * `CF-50`. Where the three verification levels stand, derived once.
 *
 * ONE derivation for two surfaces - mockup `04` panel 1's compact panel and panel 3's detail
 * screen - because a second copy is how the two come to disagree. `demande-status.ts`'s header
 * comment records this repo paying for exactly that, one enum over.
 *
 * `tone` rather than a colour: this module has no theme access, and the caller maps tone to
 * palette. That also keeps the charte's « no new colours » rule enforceable in one place.
 */
export type VerificationRow = {
  key: 'identity' | 'business' | 'repairer';
  label: string;
  status: string;
  tone: 'muted' | 'warn' | 'ok';
  /** Panel 3's explanatory paragraph. The compact panel on the hub does not render it. */
  body: string;
};

/**
 * 🛑 IMPORTED, NOT RESTATED. `@revime/shared` already exports `IdentityStatus` as
 * `z.infer<typeof identityStatusSchema>` - `'REQUIRES_INPUT' | 'PROCESSING' | 'VERIFIED' |
 * 'CANCELED'`, with the null living on `IdentityStatusResponse.status`. A hand-written copy of a
 * union the server owns is the drift `AGENTS.md` records for `NotificationType`: `tsc` only finds
 * the consumers that opted into totality, and a local copy opts out.
 */

/**
 * 🛑 `CANCELED` AND `REQUIRES_INPUT` BOTH COLLAPSE TO « À terminer », which is a decision rather
 * than an omission: the client drew three states and the identity gateway reports four, and the
 * difference between « you cancelled » and « we need more » is not one he asked us to surface.
 */
export function verificationRows(
  me: MeResponse,
  identityStatus: IdentityStatus | null,
  /** CF4-39. `GET /identity/status` `decision`, read `?? null` by the caller. */
  decision: 'REFUSED' | 'DOCUMENTS_REQUESTED' | null = null,
  /** CF5-07. `GET /business/status` `status`, read `?? null` by the caller. */
  businessStatus: BusinessVerificationStatus | null = null,
): VerificationRow[] {
  const level = me.profile.verificationLevel;

  // CF4-39: REVIME's withdrawal comes first - the refused session still reads VERIFIED. The level
  // stays the conclusion (a refusal drops it to BASIC, so it cannot be IDENTITY here).
  const isIdentityVerified =
    level === 'IDENTITY' || level === 'BUSINESS' || (identityStatus === 'VERIFIED' && decision === null);

  const identity: VerificationRow =
    level === 'IDENTITY' || level === 'BUSINESS'
      ? { key: 'identity', label: 'Identité', status: 'Vérifiée', tone: 'ok',
          body: 'Votre identité est vérifiée.' }
      : decision === 'REFUSED'
        ? { key: 'identity', label: 'Identité', status: 'Refusée', tone: 'warn',
            body: 'REVIME a refusé votre vérification. Vous pouvez recommencer.' }
        : decision === 'DOCUMENTS_REQUESTED'
          ? { key: 'identity', label: 'Identité', status: 'Nouveaux documents demandés', tone: 'warn',
              body: 'REVIME vous demande de nouveaux documents. Vous pouvez recommencer.' }
          : identityStatus === 'VERIFIED'
            ? { key: 'identity', label: 'Identité', status: 'Vérifiée', tone: 'ok',
                body: 'Votre identité est vérifiée.' }
            : identityStatus === 'PROCESSING'
              ? { key: 'identity', label: 'Identité', status: 'Vérification en cours', tone: 'warn',
                  body: 'Votre identité est en cours de vérification. Vous serez notifié dès validation.' }
              : identityStatus === null
                ? { key: 'identity', label: 'Identité', status: 'Non commencée', tone: 'muted',
                    body: "La vérification d'identité est nécessaire pour proposer vos services." }
                : { key: 'identity', label: 'Identité', status: 'À terminer', tone: 'warn',
                    body: "Votre vérification d'identité n'est pas terminée." };

  const business: VerificationRow =
    level === 'BUSINESS' || businessStatus === 'APPROVED'
      ? {
          key: 'business',
          label: 'Informations professionnelles',
          status: 'Vérifiée',
          tone: 'ok',
          body: 'Votre entreprise est vérifiée. Le badge « Professionnel vérifié » s\'affiche sur vos offres.',
        }
      : businessStatus === 'PENDING'
        ? {
            key: 'business',
            label: 'Informations professionnelles',
            status: 'Vérification en cours',
            tone: 'warn',
            body: "Votre dossier d'entreprise est en cours d'examen par nos équipes.",
          }
        : businessStatus === 'REJECTED'
          ? {
              key: 'business',
              label: 'Informations professionnelles',
              status: 'Refusée',
              tone: 'warn',
              body: "Votre vérification d'entreprise a été refusée. Vous pouvez soumettre un nouveau dossier.",
            }
          : businessStatus === 'DOCUMENTS_REQUIRED'
            ? {
                key: 'business',
                label: 'Informations professionnelles',
                status: 'Documents à renvoyer',
                tone: 'warn',
                body: 'Des pièces complémentaires sont nécessaires pour valider votre entreprise.',
              }
            : me.repairer?.kind === 'PRO' && isIdentityVerified
              ? {
                  key: 'business',
                  label: 'Informations professionnelles',
                  status: 'À faire',
                  tone: 'muted',
                  body: 'Vérifiez votre SIREN ou SIRET pour afficher le badge « Professionnel vérifié ».',
                }
              : {
                  key: 'business',
                  label: 'Informations professionnelles',
                  status: 'Non concerné',
                  tone: 'muted',
                  body: "Cette étape s'applique uniquement aux professionnels.",
                };

  // `?? null` on a NEW DTO field, matching `profil-public/index.tsx`: an app newer than the API
  // receives `completion` as `undefined`, and reading `.completed` off it throws during render -
  // which unwinds the whole tree through the global handler rather than just this screen.
  const completion = me.repairer?.completion ?? null;
  const complete = completion !== null && completion.completed === completion.total;

  const repairer: VerificationRow =
    me.profile.repairerEnabled && complete
      ? { key: 'repairer', label: 'Profil réparateur', status: 'Actif', tone: 'ok',
          body: 'Votre profil réparateur est complet.' }
      : { key: 'repairer', label: 'Profil réparateur', status: 'En attente', tone: 'warn',
          body: 'Complétez votre profil pour être prêt dès que votre identité sera validée.' };

  return [identity, business, repairer];
}

/**
 * 🛑 THE APP'S MIRROR OF THE IDENTITY FLOOR (`new Set(['IDENTITY', 'BUSINESS'])`), which since V8 E1 lives in
 * `@revime/shared` as `identityFloorMet` (`verification/gate.ts` imports it). The offer button uses `useOfferBlock`
 * now; this predicate remains for `mayVerifyBusiness`. `assertIdentityVerified` RETURNS EARLY for a profile whose
 * level is in it, so this predicate answers « would the identity gate let this account through ».
 *
 * A floor, not an equality: `BUSINESS` satisfies an `IDENTITY` gate. `BASIC` never does - it is a
 * verified e-mail or phone and says nothing about who the person is.
 *
 * 🛑 IT IS THE ACCOUNT HALF OF A TWO-PART QUESTION AND IS NOT A GATE ON ITS OWN. The other half is
 * `MeResponse.identityRequired`, which is ONLY the env flag (`users.service.ts` sets it from
 * `isIdentityGateEnabled()`, i.e. `process.env.IDENTITY_GATE_ENABLED === 'true'`) and carries no
 * account information at all. A caller that asks one without the other is wrong in one of two
 * directions: the flag alone blocks verified réparateurs the server would allow, and the level
 * alone blocks everyone while the flag is off. See `app/demande/[id]/index.tsx`'s
 * `identityBlocked`, which is where that error was found and fixed on 2026-09-01.
 *
 * Extracted here rather than inlined at each caller so the two consumers cannot drift apart, and
 * so this file stays the one place the app restates a level threshold the server owns.
 */
export function hasSufficientIdentity(
  me: MeResponse,
  identityStatus?: IdentityStatus | null,
  decision?: 'REFUSED' | 'DOCUMENTS_REQUESTED' | null,
): boolean {
  const level = me.profile.verificationLevel;
  if (level === 'IDENTITY' || level === 'BUSINESS') return true;
  if (identityStatus === 'VERIFIED' && (!decision || decision === null)) return true;
  return false;
}

/**
 * 🛑 THE « Devenir professionnel » BUTTON RENDERS ONLY AT `IDENTITY` OR `BUSINESS`, and its
 * absence below that is the point rather than a gap. `business.service.ts` checks `MAY_VERIFY`
 * before anything else and throws FORBIDDEN under `IDENTITY`, and `IDENTITY` is blocked on
 * `CF-08` - so at BASIC this button would land on a server that says no. `CF-31` records the
 * test: not « is this the helpful next step » but « will the server the button lands on say yes
 * today ». `profil.tsx`'s MON ENTREPRISE section answers it the same way.
 *
 * Kept as its own name even though it currently delegates to `hasSufficientIdentity`: the two ask
 * DIFFERENT questions that happen to share one threshold today - « may he start the SIRET check »
 * versus « would the identity gate let him through » - and `business.service.ts` could move its
 * floor without `gate.ts` moving its own. Delegating rather than duplicating records the
 * coincidence in one place instead of hiding it in two copies of the same comparison.
 */
export function mayVerifyBusiness(
  me: MeResponse,
  identityStatus?: IdentityStatus | null,
  decision?: 'REFUSED' | 'DOCUMENTS_REQUESTED' | null,
): boolean {
  return hasSufficientIdentity(me, identityStatus, decision);
}
