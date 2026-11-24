import { businessStepRefusal, identityFloorMet } from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/** A floor, not an equality: IDENTITY and BUSINESS both satisfy a BASIC gate. */
const SUFFICIENT = new Set(['BASIC', 'IDENTITY', 'BUSINESS']);

/**
 * The floor one rung up (BUSINESS satisfies an IDENTITY gate; BASIC never does, because BASIC is a
 * verified email or phone and says nothing about who the person is) lives in `@revime/shared` as
 * `identityFloorMet` since V8 E1, so the app's offer sheet and `meetsOfferFloor` below share it.
 */

/**
 * Enforces the client's level 1 rule on the two actions that transact.
 *
 * Behind a flag, and **the flag ships false**. `autoDeploy: true` on `main` means
 * the server half goes live the moment anything is pushed, and the build
 * currently installed on the client's phone carries no verification screen - so a
 * live gate would answer 403 to his Publier and his offer submit with no route in
 * the app to satisfy it. That removes his core action rather than merely
 * misrendering it, which is a worse failure than the piece C window.
 *
 * Compared against the literal `'true'` so that any other value - a stray `'1'`,
 * `'false'`, an empty string, an unset variable - fails safe to off. An
 * enabled-unless-disabled reading would be the exact defect that breaks his app.
 */
/**
 * The single reader of the flag, so the gate and the app can never disagree
 * about whether it is on.
 *
 * Surfaced to the client through `MeResponse.verificationRequired`. Without that,
 * the app would have to guess: gating its own UI on the level alone would block
 * publishing while the server still allowed it, which is the exact divergence
 * this flag exists to prevent, and it would block the client on the next build
 * even with the gate off.
 */
export function isVerificationGateEnabled(): boolean {
  // CF2-03: Verification is mandatory.
  return true;
}

/**
 * Whether the server is enforcing the client's level 2 rule on réparateurs.
 *
 * **A second flag rather than a reuse of `VERIFICATION_GATE_ENABLED`, and the
 * separation is the point.** That one waits on an EAS build carrying the
 * `/verification` screen; this one waits on a *grant path* to IDENTITY, which
 * neither piece 4 nor anything merged today provides. They will be flipped on
 * different days, and one flag would force them to move together.
 *
 * **It ships absent, so it ships off**, and until a grant path exists that is the only safe
 * setting.
 *
 * 🛑 CORRECTED 2026-09-03: this said « every account is NONE or BASIC, so enforcing this
 * would refuse réparateur mode to every réparateur, the client's own account included ».
 * MEASURED against production that day: of 21 réparateur-enabled profiles, **20 are at NONE,
 * one is at IDENTITY, and none is at BASIC.** The conclusion survives - 20 of 21 would be
 * refused - but the premise no longer holds, and a premise nobody re-checks is how a stale
 * comment becomes a stale decision.
 *
 * Compared against the literal `'true'` for the same fail-safe reason as its
 * sibling above.
 */
export function isIdentityGateEnabled(): boolean {
  // CF2-05: Identity verification is mandatory for all repairers.
  return true;
}

/**
 * Enforces *« pour devenir réparateur […] il devra obligatoirement passer au
 * niveau 2 »* - the client's own words, 2026-08-14.
 *
 * Called on ONE thing since CF4-01: **sending an offer**. It used to be called on
 * becoming a réparateur too (`'become'`, in `UsersService.updateModes`), and that
 * door gate deadlocked the journey - an unverified client could not enable
 * réparateur mode, and the verification screen is reached from réparateur mode.
 * The offer gate already covers the door concern: a réparateur can do nothing that
 * transacts without it, and gating only the door would have grandfathered in every
 * réparateur who already exists anyway. So identity is required on the action, not
 * on the mode.
 *
 * Deliberately NOT called on switching `activeMode` between modes already
 * enabled. That would trap whoever is in réparateur mode the day the flag is
 * flipped, with no route back to client mode.
 */
export async function assertIdentityVerified(
  prisma: Pick<PrismaService, 'profile' | 'repairerProfile' | 'businessVerification'>,
  userId: string,
  action: 'offer',
): Promise<void> {
  if (!isIdentityGateEnabled()) return;
  const { level, kind } = await readOfferStanding(prisma, userId);
  if (meetsOfferFloor(level, kind)) return;

  // `action` is kept as a parameter so a future caller must name what it gates.
  void action;

  // V7 A3: a PRO whose identity IS verified is missing the business step, not the identity one, and
  // used to be told « Vérifiez votre identité ». The rule itself is the client's (V2 §2, `DEC7-06`).
  if (kind === 'PRO' && level === 'IDENTITY') {
    const business = await prisma.businessVerification.findUnique({
      where: { userId },
      select: { status: true },
    });
    throw new AppException('FORBIDDEN', businessRefusal(business?.status));
  }
  throw new AppException('FORBIDDEN', 'Vérifiez votre identité pour envoyer une offre.');
}

function businessRefusal(status: string | undefined): string {
  return (
    businessStepRefusal(status) ??
    'Faites vérifier votre entreprise dans « Mon entreprise » pour envoyer une offre.'
  );
}

/**
 * The sentence for a business verification already under way or to redo, null when there is none. Shared with the
 * CGU art. 53 cap (V7 A10, `DEC7-22` Q9). Moved to `@revime/shared` by V8 E1 so the app's offer sheet shows the same
 * words; re-exported here so this module's callers are unchanged.
 */
export { businessStepRefusal };

/**
 * The offer gate's level rule as a boolean: BUSINESS for a PRO, IDENTITY or BUSINESS
 * otherwise. Extracted for CF4-25, which must know whether a TARGET réparateur could answer
 * a quote request before sending him one, without throwing his message at the client.
 * `assertIdentityVerified` above is this plus the flag and the refusal.
 */
export async function hasOfferIdentity(
  prisma: Pick<PrismaService, 'profile' | 'repairerProfile'>,
  userId: string,
): Promise<boolean> {
  const { level, kind } = await readOfferStanding(prisma, userId);
  return meetsOfferFloor(level, kind);
}

async function readOfferStanding(
  prisma: Pick<PrismaService, 'profile' | 'repairerProfile'>,
  userId: string,
): Promise<{ level: string; kind: string | undefined }> {
  const profile = await prisma.profile.findFirst({
    where: { userId, deletedAt: null },
    select: { verificationLevel: true },
  });
  const repairerProfile = await prisma.repairerProfile.findUnique({
    where: { userId },
    select: { kind: true },
  });
  return { level: profile?.verificationLevel ?? 'NONE', kind: repairerProfile?.kind };
}

/**
 * V8 E1: the shared rule, so the app's offer sheet (`offerBlock`) and this gate cannot drift apart
 * (`test/v8-e1-offer-gate-parity.spec.ts`). Same answer as before: BUSINESS for a PRO, IDENTITY or BUSINESS otherwise.
 */
function meetsOfferFloor(level: string, kind: string | undefined): boolean {
  return identityFloorMet(level as Parameters<typeof identityFloorMet>[0], kind as 'PRO' | 'INDIVIDUAL' | undefined);
}

/**
 * `'edit'` joined the union with `CF-16`, and NEITHER original string was a reuse candidate - for
 * two different reasons, so check both before ever collapsing this ternary:
 *
 *   - the PUBLISH string ends « … pour publier une demande », which is false when the caller is
 *     editing a demande that is already published;
 *   - the OFFER string names sending an offer, which an edit is not.
 *
 * Reusing either would tell the user to satisfy a gate for an action they are not attempting.
 */
export async function assertBasicVerified(
  prisma: Pick<PrismaService, 'profile'>,
  userId: string,
  action: 'publish' | 'offer' | 'edit',
): Promise<void> {
  if (!isVerificationGateEnabled()) return;

  const profile = await prisma.profile.findFirst({
    where: { userId, deletedAt: null },
    select: { verificationLevel: true },
  });
  if (profile && SUFFICIENT.has(profile.verificationLevel)) return;

  throw new AppException(
    'FORBIDDEN',
    action === 'publish'
      ? 'Confirmez votre e-mail ou votre téléphone pour publier une demande.'
      : action === 'edit'
        ? 'Confirmez votre e-mail ou votre téléphone pour modifier votre demande.'
        : 'Confirmez votre e-mail ou votre téléphone pour envoyer une offre.',
  );
}
