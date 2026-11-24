import { View, Text, StyleSheet, ScrollView, Pressable, Image, Share } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
/**
 * `CF-53`. Used only to BUILD the deep link, never to open one.
 *
 * 🛑 `expo-linking` resolves its native half with the THROWING `requireNativeModule('ExpoLinking')`
 * (`expo-linking/build/ExpoLinking.js:2`), so importing it without that half in the binary would
 * unwind the whole app - the `expo-image-picker` incident in `apps/mobile/AGENTS.md`. It is safe
 * here, and this was checked rather than assumed: it has been in `apps/mobile/package.json` since
 * **2026-07-28** (`04f900d`), long before build 6 of 2026-08-21, so its native half is in the
 * installed binary. **This adds no native dependency and therefore costs no EAS build.**
 */
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { useTheme } from '../../../src/theme';
import { isPrivateDemandeItem } from '../../../src/components/demande/demande-filter';
import { ScreenMotif } from '../../../src/components/ScreenMotif';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { Card } from '../../../src/components/Card';
import { Badge } from '../../../src/components/Badge';
import { Button } from '../../../src/components/Button';
import { RevimeLoader } from '../../../src/components/lottie/RevimeLoader';
import { DemandeProgressChain } from '../../../src/components/DemandeProgressChain';
import {
  useDemande,
  useCancelQuote,
  useDeclineQuote,
  useRefuseQuote,
} from '../../../src/lib/queries';
import { useIdentityStart } from '../../../src/lib/use-identity-start';
import { useSessionContext } from '../../../src/lib/session';
import { ApiError } from '../../../src/lib/api';
import { IconLocation, IconLock, IconShieldCheck, IconShare } from '../../../src/icons';
import {
  euros,
  repairStatus,
  demandeEditPolicy,
  demandeShareText,
  formatPublicLocation,
  declineQuoteRequestSchema,
  quoteRequestActions,
  quoteRequestHeader,
  quoteRequestLabel,
  quoteRequestTargetLabel,
  quoteBadge,
  quoteClosedDetail,
  quoteExpiryDay,
  publicIdentity,
} from '@revime/shared';
import type { DemandeDto } from '@revime/shared';
import { Field } from '../../../src/components/Field';
import { FavoriteHeart } from '../../../src/components/FavoriteHeart';
import {
  useFavoriteDemandes,
  useToggleFavoriteDemande,
} from '../../../src/lib/queries';
import { OfferGateSheet } from '../../../src/components/OfferGateSheet';
import { useOfferBlock } from '../../../src/lib/use-offer-block';
import { KeyboardAvoider } from '../../../src/components/KeyboardAvoider';

/**
 * « Détail de la demande », rebuilt on 2026-08-20 to match the approved prototype
 * (`repareme-web/src/screens/DemandeDetail.tsx`).
 *
 * It was a label/value `Card` - « Objet », « Problème », « Pièces », « Mode » - under a plain
 * « Retour » text link. That is a data dump rather than a screen: a réparateur reads this to
 * decide whether to quote, so the prototype leads with the photo, states the pricing posture in
 * one dark badge, and closes on who the client is.
 *
 * 🛑 TWO PROTOTYPE ELEMENTS ARE ABSENT, and neither is an oversight.
 *
 * 1. **The delivery badges (« Déplacement », « Dépôt »).** `Demande` has no such column and the
 *    publish wizard never asks, because this product collects delivery LATER: `paiement.tsx`
 *    renders `DELIVERY_OPTIONS` filtered by the accepted offer's `travel` and `acceptsParcel`,
 *    landing on `Commande.delivery`. Delivery is the réparateur's capability plus the client's
 *    choice at payment, not a publish-time declaration, so those badges are from an earlier
 *    design. Rendering them would need a migration and a wizard step, and would contradict a
 *    shipped decision.
 * 2. **The client's « ★ 4.8 ».** No client rating exists anywhere - `Review.repairerUserId` is
 *    required and the aggregate indexes on it, so reviews only ever run client → réparateur.
 *    The card ships with a name and a join date, which are true.
 *
 * The photo gallery is unchanged from the demande-photos slice, including its index clamping.
 */

/**
 * Third person, because a RÉPARATEUR reads this screen. `publier.tsx` has its own first-person
 * map (« Je fournis la pièce ») for the client choosing, and the two are deliberately not
 * shared: same enum, different speaker.
 */
const PARTS_LABEL: Record<DemandeDto['parts'], string> = {
  UNKNOWN: 'Non précisé',
  ORIGINAL: "Pièce d'origine",
  COMPATIBLE: 'Pièce compatible',
  CLIENT_SUPPLIED: 'Fournie par le client',
};

/** Reserves room for the fixed CTA so the last card is never trapped under it. */
const CTA_SPACE = 120;

export default function DemandeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette, spacing, radii, accent } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { me, refresh } = useSessionContext();
  const activeMode = me?.profile.activeMode ?? 'CLIENT';
  const demande = useDemande(id ?? '');
  const favoriteDemandes = useFavoriteDemandes();
  const toggleFavoriteDemande = useToggleFavoriteDemande();
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  /**
   * `CF-19` / `CF-27`, added 2026-08-31. The header heart's own error line. This screen had no
   * error state at all, so a refused or 404'd favourite was invisible.
   */
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  /**
   * `CF-53`. The share control's own error line.
   *
   * `Share.share` REJECTS rather than resolving falsy when the sheet cannot be presented, and
   * `apps/mobile/AGENTS.md`'s rule is that a control which silently does nothing reads as a broken
   * app - say so in French instead. Separate from `favoriteError` because the two failures are
   * unrelated and one must not clear the other's message.
   */
  const [shareError, setShareError] = useState<string | null>(null);

  const d = demande.data;

  /**
   * 🛑 `author` and `distanceKm` are read through `?? null` because **THIS SCREEN CAN BE NEWER
   * THAN THE API IT IS TALKING TO**, and both fields landed on `DemandeDto` the same day as this
   * layout. An API that predates them omits them entirely, so they arrive `undefined` - and
   * `undefined` is NOT `null`.
   *
   * Measured, not hypothetical: it crashed on device (« Cannot read property 'firstName' of
   * undefined »), because every guard below was written `!== null`, which `undefined` passes.
   * The throw happened during render, so the global handler in `app/_layout.tsx` caught it and
   * React unwound the whole tree - fatal, not degraded, exactly like the `expo-image-picker`
   * incident recorded in `AGENTS.md`.
   *
   * It also silently produced « Paris 75017 · undefined km » on the location chip, which is the
   * worse half: no error, just a lie on screen.
   *
   * Normalising ONCE here rather than fixing five call sites is deliberate - the codebase's own
   * rule from `src/lib/image-picker.ts`: give absence a single representation, and make it
   * `null`, never `undefined`.
   */
  const author = d?.author ?? null;
  const distanceKm = d?.distanceKm ?? null;
  // 🛑 `?? null` at the point of entry, not `!== null` at each use.
  // apps/mobile/AGENTS.md records why: a newly added DTO field arrives
  // `undefined` from an API that has not compiled the change, `undefined !== null`
  // is true, and the last time this rule was broken it threw during render and
  // unwound the whole app. `username` is NOT NULL server-side, so the only way it
  // is absent is a stale API - which is exactly the case this guards.
  const authorUsername = author?.username ?? null;

  /**
   * 🛑 THE AUTHOR IS THE VIEWER WHOSE `demande.author` IS NULL. `present()` on the server
   * suppresses the `author` object precisely because the creator is by definition the author
   * (see `demandes.service.ts` comment: "The creator is by definition the author, so `author`
   * comes back null"). So `isAuthor` is `d?.author === null`, not `!== null`.
   *
   * This screen already relies on this: `canFavorite = d !== undefined && author !== null` -
   * favouriting is for everyone *except* the author, which is exactly why the header's `right`
   * slot is free for them.
   */
  const isAuthor = d?.author === null;

  /**
   * `CF-16` / `CF-17`. What the author can do to their demande, enforced here and by
   * `DemandesService.update`. Both contract fields and deletes are locked once offers arrive.
   */
  const policy = d ? demandeEditPolicy(d.status, d.offerCount) : { canEdit: false, contractLocked: false, canDelete: false };

  /**
   * A non-null `author` means the viewer is NOT the author, which is the one condition that
   * makes an offer meaningful - see `DemandeDto.author`. A client reaches this screen from
   * their own commande (`commande/[id].tsx`), and before this it showed them « Proposer une
   * offre » on their own demande; the server refused it, but the button should not have been
   * there. `status` is checked too, so a demande that has moved on carries no CTA either.
   *
   * With an older API this is null, so the CTA is HIDDEN rather than shown - failing closed,
   * which is the right direction: a button that 422s is worse than a button that is absent.
   *
   * 🛑 `activeMode === 'REPAIRER'` ADDED 2026-09-01, and it closes a live `CF-12`-shaped hole.
   * This expression used to ask only « is it someone else's, and is it open », so a CLIENT-mode
   * account saw « Faire une offre ». The path is real: `favoris.tsx` renders its favorited-
   * DEMANDES list when `activeMode === 'CLIENT' && tab === 'demandes'`, and EVERY LIVE
   * RÉPARATEUR ACCOUNT SITS IN CLIENT MODE, so it was not an edge case.
   *
   * `activeMode`, NOT `repairerEnabled`: sending an offer is something you do *as* a
   * réparateur, so the question is « is he looking at it right now », not « does he have the
   * capability ». A réparateur in client mode must switch modes to offer. That is `CF-12`'s
   * principle, not a regression.
   *
   * Gating the CONTROL is correct here and is NOT the forbidden hoist that
   * `apps/mobile/AGENTS.md` warns about: that prohibition is against raising a row's condition
   * to its SECTION and changing its siblings' reachability. This is a single control in its own
   * footer and is not the sole route to anything.
   */
  /**
   * CF4-25. A private « Demander un devis » (`quoteRequest` non-null). `?? null` at entry: the
   * field is new on `DemandeDto` and a stale API omits it (apps/mobile/AGENTS.md).
   *
   * The viewer is TARGET only in réparateur mode, for the reason `offerTarget` gives below:
   * quoting is done *as* a réparateur. Everyone else who can read a private request is the
   * author (the server 404s anyone else), so OTHER only covers the target in client mode.
   * A live quote is `offerCount > 0` - the server counts only ACCEPTABLE offers, and the
   * partial unique index allows at most one live offer per private request.
   */
  const quoteRequest = d?.quoteRequest ?? null;
  const isPrivate = d ? isPrivateDemandeItem(d) : false;
  const quoteViewer: 'AUTHOR' | 'TARGET' | 'OTHER' = isAuthor
    ? 'AUTHOR'
    : quoteRequest !== null && quoteRequest.repairer.userId === me?.id && activeMode === 'REPAIRER'
      ? 'TARGET'
      : 'OTHER';
  const quoteActions =
    d && quoteRequest
      ? quoteRequestActions({ viewer: quoteViewer, status: d.status, hasLiveQuote: d.offerCount > 0 })
      : null;
  /**
   * The target réparateur in EITHER mode, for copy only (review I4): he must read the client's
   * handle and « Devis envoyé », never his own name and « Devis reçu ». Actions still key on
   * `quoteViewer`, which requires réparateur mode.
   */
  const isTargetViewer = !isAuthor && quoteRequest !== null && quoteRequest.repairer.userId === me?.id;
  const cancelQuote = useCancelQuote(id ?? '');
  const refuseQuote = useRefuseQuote(id ?? '');
  const declineQuote = useDeclineQuote(id ?? '');
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineNote, setDeclineNote] = useState('');
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const runQuote = (fn: () => Promise<unknown>) => {
    setQuoteError(null);
    fn().catch((e: unknown) =>
      setQuoteError(e instanceof ApiError ? e.message : "L'action n'a pas pu aboutir. Réessayez."),
    );
  };

  const submitDecline = () => {
    const parsed = declineQuoteRequestSchema.safeParse({ note: declineNote });
    if (!parsed.success) {
      setQuoteError(parsed.error.issues[0]?.message ?? 'Indiquez la raison du refus.');
      return;
    }
    runQuote(() => declineQuote.mutateAsync(parsed.data).then(() => setDeclineOpen(false)));
  };

  const offerTargetPublic =
    d !== undefined && author !== null && d.status === 'OPEN' && activeMode === 'REPAIRER'
      ? d.id
      : null;
  /**
   * On a private request the fixed CTA is « Envoyer un devis », and only for the target with no
   * live quote yet (`quoteRequestActions`). The server refuses any other réparateur anyway
   * (`targetableByRepairerWhere`), but it never reads the request, so this is belt and braces.
   */
  const offerTarget = isPrivate ? (quoteActions?.canSendQuote ? offerTargetPublic : null) : offerTargetPublic;

  /**
   * `CF-10`. THREE halves, and all three are load-bearing.
   *
   * 🛑 CORRECTED 2026-09-01. This expression was `identityRequired && connectEnabled`, and the
   * comment here asserted that `identityRequired` is « the server's answer about the flag AND
   * this account's level » with a warning that « gating on `verificationLevel` alone would refuse
   * people the server would allow ». BOTH SENTENCES WERE FALSE, and the error originated in the
   * spec's §3.2. `users.service.ts` sets `identityRequired: isIdentityGateEnabled()`, and that
   * function is exactly `process.env.IDENTITY_GATE_ENABLED === 'true'` - SO IT IS ONLY THE ENV
   * FLAG and carries no account-specific information whatever.
   *
   * What that cost: the day the flag is flipped, a réparateur already at `IDENTITY` or `BUSINESS`
   * - precisely the person `verification/gate.ts` lets THROUGH, because `assertIdentityVerified`
   * returns early when the profile's level is in `SUFFICIENT_IDENTITY` - would have got the LOCKED
   * CTA, been told « Votre compte n'est pas encore vérifié. » (a false claim about the user, the
   * class `apps/mobile/AGENTS.md` bans), and his only remedy would have been another Stripe
   * Identity session, which cannot change a process-level env flag. **The gate's own remedy could
   * not clear the gate.**
   *
   * So the account half has to be asked separately, and it is `hasSufficientIdentity` -
   * `src/lib/verification-rows.ts`'s mirror of the server's own `SUFFICIENT_IDENTITY` set, shared
   * with `mayVerifyBusiness` rather than restated here so the two cannot drift.
   *
   * `identityRequired` - is the server ENFORCING the gate right now. Read rather than inferred:
   * the flag ships absent, so an app gating on the level alone would lock a CTA the server would
   * accept, which is the divergence `MeResponse`'s flag fields exist to prevent.
   *
   * `connectEnabled` - with Connect off there is NO GRANT PATH: « Vérifier mon identité » would
   * start a flow that cannot complete. `CF-31`'s rule - the test for a CTA is not « is this the
   * helpful next step » but « will the server it lands on say yes today ».
   *
   * `!hasSufficientIdentity(me)` - is THIS ACCOUNT actually short of the level the server checks.
   *
   * The MODE question is answered by `offerTarget` above, which gates the footer holding this
   * sheet's only trigger. So the sheet is unreachable in client mode by construction.
   *
   * 🆕 V8 E1 (`DEC8-08` (6)): the account half is now `useOfferBlock`, the server's own rule
   * (`offerBlock` in `@revime/shared`, the function `verification/gate.ts` uses, proven row for row by
   * `apps/api/test/v8-e1-offer-gate-parity.spec.ts`). It keeps both flag halves above and adds what
   * `hasSufficientIdentity` could not see: a PRO needs his BUSINESS verified (he used to meet that refusal
   * only after the whole form), a session under review, and an unconfirmed e-mail/phone. The sheet says
   * which, and its button goes to that step.
   */
  const offerBlockReason = useOfferBlock();
  const identityBlocked = offerBlockReason !== null;
  const [gateVisible, setGateVisible] = useState(false);
  const identityStart = useIdentityStart({
    navigateToReturn: false,
    onSuccess: () => {
      setGateVisible(false);
      void refresh();
    },
  });

  const isFavorited = favoriteDemandes.data?.some((item) => item.id === id) ?? false;
  // CF4-25: not on a private request - favourites and share links are public-demande surfaces,
  // and a shared link to a private request 404s for every recipient but the two parties.
  const canFavorite = d !== undefined && author !== null && !isPrivate;

  const handleToggleFavorite = () => {
    if (!id) return;
    setFavoriteError(null);
    toggleFavoriteDemande.mutate(
      { demandeId: id, next: !isFavorited },
      {
        // 🛑 Added 2026-08-31: this toggle had no `onError`, so every French refusal the server
        // authored was thrown away - « Vous ne pouvez pas enregistrer votre propre annonce. »,
        // « Cette annonce n'est plus disponible. » - and against the API deployed today, which has
        // no `/favorites` routes, the heart was a control that did nothing at all. Same shape as
        // `reparateur/[userId].tsx`'s heart and as `offres.tsx`. A button that silently does
        // nothing reads as broken; say so in French instead.
        onError: (e) =>
          setFavoriteError(
            e instanceof ApiError ? e.message : "Ce favori n'a pas pu être enregistré.",
          ),
      },
    );
  };

  /**
   * `CF-53`. The share glyph mockup `02` draws beside the header heart.
   *
   * ## What it sends, and why there is no web page
   *
   * The owner's decision of 2026-09-02: a readable description with a deep link appended, NOT a
   * public web page per demande. There is no public URL for a demande - one would be a new public
   * surface plus a privacy decision about what a stranger sees of a client's photos - so that was
   * re-scoped as a product direction rather than this item. The message therefore has to stand on
   * its own with the link stripped out, which is what `demandeShareText` is shaped for.
   *
   * 🛑 THE LINK GOES IN `message`, NEVER IN `url`. React Native's `url` field is **iOS-only** and
   * `title` is **Android-only** (checked against the current RN reference, not recalled). A link
   * passed as `url` silently disappears on Android, leaving a description with nothing to tap and
   * no error raised anywhere.
   *
   * ## 🛑 Who a shared link can actually work for - narrower than it looks
   *
   * `demandes.service.ts:563` gates reads: you may read a demande if you authored it, **or** if
   * your profile is `repairerEnabled` **and** its status is `OPEN`. Anything else 404s *identically
   * to a nonexistent id*, deliberately, so ids stay unenumerable. And there is no route guard in
   * `app/_layout.tsx`, so a deep link lands straight on this screen without a session.
   *
   * So the link opens the demande only for a **signed-in réparateur, on a still-OPEN demande**.
   * For everyone else the TEXT is the entire value. That is not a defect to fix here - the 404 is
   * a security property - but it is why the copy leads with the description and why the error
   * branch below distinguishes 401 from 404.
   *
   * `Linking.createURL` rather than a hand-written `revime://…`: it is the documented API and it
   * derives the scheme from `app.json` (`"scheme": "revime"`), so this cannot drift from the config
   * the way the five hard-coded server-side redirect strings can. Note it is environment-dependent
   * by design - in a dev client it returns an `exp://` URL. There is no dev client today, so every
   * link this produces is the standalone `revime:///…` form.
   */
  const handleShare = async () => {
    // `canFavorite` already requires `d !== undefined`, so this cannot fire with no demande - the
    // guard is here because that fact lives in the render tree and does not narrow the type.
    if (d === undefined) return;
    setShareError(null);
    try {
      await Share.share({ message: demandeShareText(d, Linking.createURL(`/demande/${d.id}`)) });
    } catch {
      /**
       * Deliberately not surfacing the platform error's own text: it is English, unlocalised and
       * written for a developer. `Share.dismissedAction` is NOT an error and is not handled - on
       * Android the promise always resolves `sharedAction` regardless of what the user did, so
       * nothing here may treat dismissal as a failure.
       */
      setShareError("Le partage n'a pas pu s'ouvrir.");
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      {/* The motif follows the VIEWER, not the screen. The prototype's DemandeDetail is a
          réparateur route so it hardcodes navy, but this one screen serves both: a client
          reaches it from their own commande, and a navy wash under a red-accented app reads
          as the wrong mode. Same expression `recherche.tsx` uses. */}
      <ScreenMotif v={4} variant={activeMode === 'REPAIRER' ? 'navy' : 'accent'} />
      <ScreenHeader
        title="Détail de la demande"
        onBack={() => router.back()}
        right={
          canFavorite ? (
            /**
             * 🛑 `CF-53`. HEART FIRST, THEN SHARE - the order mockup `02` draws, confirmed by
             * measuring the red ink in the header band (heart 317.7–334.6pt, share 353.8–368.5pt
             * on a 390pt frame) rather than by reading the picture at full size.
             *
             * `gap: 16` is NOT cosmetic. Both controls carry `hitSlop={8}`, so any gap below 16
             * makes their touch areas OVERLAP, and RN resolves an overlap to whichever view is on
             * top - a tap aimed at the heart's trailing edge would open the share sheet. At 16 the
             * two slops meet exactly and never intersect. The mockup implies ~11pt centre-to-centre
             * spacing; 16 is 5pt wider and touch separation is the reason.
             *
             * The by-product is fidelity: 24 + 16 + 24 = 64pt puts the share glyph's ink **18.0pt**
             * from the screen edge against the **21.5pt** the mockup draws, with the heart's
             * trailing ink 1.6pt out and the share's leading ink 1.8pt out. Every figure here is
             * computed from the glyphs' own path data plus half the rendered 2pt stroke, not
             * eyeballed. Keeping the old fixed `width: 40` could not have produced these positions
             * under any Yoga behaviour - see `ScreenHeader`'s `rightSlot`, which also records what
             * about that is measured and what is still unobserved.
             *
             * Share renders for the NON-AUTHOR only, which is the one view mockup `02` draws (it
             * is a réparateur screen: locked « Faire une offre », a « Client » card). A deliberate
             * omission, not an oversight - the author's slot already holds « Modifier » at 55.0pt,
             * and adding an icon there measures a 96pt trailing group, an 11pt margin on a 375pt
             * SE and a 28pt title shift. If the author's own share is ever wanted it is a small
             * follow-up, not a bug.
             */
            <View style={styles.headerControls}>
              <FavoriteHeart filled={isFavorited} onToggle={handleToggleFavorite} />
              <Pressable
                onPress={handleShare}
                accessibilityRole="button"
                accessibilityLabel="Partager cette demande"
                hitSlop={8}
              >
                {/* 24pt and `palette.red`, matching the heart beside it.
                    🛑 The mockup draws both glyphs SMALLER than this: its heart ink is 17.0pt wide
                    and its share ink 14.7pt, which back out to a nominal ~18.5pt and ~17.6pt against
                    our 22.0pt and 20.0pt of ink at size 24. So the shipped heart has been larger
                    than drawn since `CF-19`, and matching its sibling beats restyling a delivered
                    control - a 24pt icon next to an 18pt one would read as the defect. */}
                <IconShare size={24} color={palette.red} strokeWidth={2} />
              </Pressable>
            </View>
          ) : isAuthor && policy.canEdit && !isPrivate ? (
            // 🛑 ONE control for this action, and it lives HERE only. The CF-19 comment below
            // records why: mockup 02 drew two save controls and the owner chose one, because
            // « écrans qui font doublon » is a thing the client complained about. Delete is on
            // the edit screen for the same reason - not a second header control.
            <Pressable
              onPress={() => router.push(`/demande/${id}/modifier`)}
              accessibilityRole="button"
              accessibilityLabel="Modifier cette demande"
              hitSlop={8}
            >
              <Text style={[styles.bodyStrong, { color: palette.red }]}>Modifier</Text>
            </Pressable>
          ) : undefined
        }
      />
      {/* 🛑 CF-19. Mockup 02 drew BOTH a header heart and a footer « Enregistrer » button. The
          owner chose the header heart alone. The footer stays exactly as it is. This comment
          exists so a later reader does not add the second control - which would be two controls
          for one action on one screen, the « écrans qui font doublon » class the client
          complained about. */}

      {demande.isPending ? (
        <View style={styles.loaderContainer}>
          <RevimeLoader variant="fill" size={72} />
        </View>
      ) : (
        <KeyboardAvoider>
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: offerTarget !== null ? CTA_SPACE : spacing.xxl,
          }}
        >
          {/* The heart lives in the header above, so its failure belongs at the top of the content
              rather than beside the CTA at the bottom. The rollback in `queries.ts` has already put
              the heart back, so this line is the only thing left to say. */}
          {favoriteError !== null && (
            <Text style={[styles.bodyStrong, { color: palette.red, marginBottom: spacing.md }]}>
              {favoriteError}
            </Text>
          )}

          {/* `CF-53`. The share control sits in the same header, so its failure belongs in the same
              place as the heart's. A separate element rather than a combined line, so one failure
              never overwrites the other's message. */}
          {shareError !== null && (
            <Text style={[styles.bodyStrong, { color: palette.red, marginBottom: spacing.md }]}>
              {shareError}
            </Text>
          )}

        {/**
         * 🛑 `CF-53` SPLIT THIS INTO TWO CASES, and the reason is the share link.
         *
         * Before this slice an unauthenticated arrival here was effectively impossible - every
         * route into this screen came from inside a signed-in session. A shared deep link creates
         * that path for the first time: there is no route guard in `app/_layout.tsx`, so the link
         * renders this screen directly, `GET /demandes/:id` 401s, and the single hardcoded line
         * below told the recipient the demande was gone. It is not gone; they are not signed in.
         * That is the false-claim-about-the-user class `apps/mobile/AGENTS.md` bans.
         *
         * 401 is safe to name because `http-exception.filter.ts` maps it to `UNAUTHENTICATED` with
         * the server's own French « Vous devez être connecté. ».
         *
         * 🛑 THE 404 COPY IS DELIBERATELY UNCHANGED, and do not "improve" it into « vous n'avez pas
         * accès ». `demandes.service.ts:563` returns the SAME 404 for a demande that never existed,
         * one that was deleted, one that has left `OPEN`, and one belonging to another client -
         * expressly so ids stay unenumerable. The app genuinely cannot tell those apart, so a
         * message implying it can would be a guess dressed as a fact. « n'est plus disponible » is
         * true of every one of them.
         */}
        {demande.isError && (
          <Text style={[styles.bodyStrong, { color: palette.red }]}>
            {demande.error instanceof ApiError && demande.error.code === 'UNAUTHENTICATED'
              ? demande.error.message
              : "Cette demande n'est plus disponible."}
          </Text>
        )}

        {!demande.isError && d && (
          <View>
            {/* CF6-15. Dedicated lifecycle status badge for private quote requests across all states, or public badge */}
            {quoteRequest !== null ? (
              <View style={{ marginBottom: spacing.lg, alignSelf: 'flex-start' }}>
                {(() => {
                  const b = quoteBadge({
                    status: d.status,
                    hasLiveQuote: d.offerCount > 0,
                    closedReason: quoteRequest.closedReason,
                    viewer: isTargetViewer ? 'REPAIRER' : 'CLIENT',
                  });
                  return <Badge label={b.label} tone={b.tone} />;
                })()}
              </View>
            ) : d.status === 'OPEN' ? (
              <View style={{ marginBottom: spacing.lg, alignSelf: 'flex-start' }}>
                <Badge
                  tone="neutral"
                  label="En attente d'offres"
                />
              </View>
            ) : null}

            {/* Progress chain showing the demande's current status through the repair lifecycle */}
            {(!isPrivate || d.status !== 'CANCELLED') && d.status !== 'OPEN' && (
              <Card style={{ marginBottom: spacing.lg }}>
                <Text style={[styles.eyebrow, { color: palette.muted, marginBottom: spacing.sm }]}>
                  SUIVI
                </Text>
                <DemandeProgressChain
                  status={repairStatus(
                    {
                      demandeStatus: d.status,
                      offerCount: d.offerCount,
                      // Forward compatibility: distinguish absent (old API) from null (no commande exists).
                      // An absent key degrades to null rather than client index 0.
                      commande: 'commande' in d ? d.commande : null,
                    },
                    'CLIENT',
                  )}
                />
              </Card>
            )}

            {/* CF4-25. The private request's own card: who it is for, its state, the two fields a
                public demande has no column for, and the buttons `quoteRequestActions` allows. */}
            {quoteRequest !== null && (
              <Card style={{ marginBottom: spacing.lg }}>
                <Text style={[styles.bodyStrong, { color: palette.ink }]}>
                  {isTargetViewer
                    ? quoteRequestHeader(quoteRequest, { clientUsername: authorUsername })
                    : quoteRequestHeader(quoteRequest)}
                </Text>
                {d.status === 'CANCELLED' && (
                  <Text style={[styles.body, { color: palette.muted, marginTop: 4 }]}>
                    {quoteClosedDetail(quoteRequest.closedReason, isTargetViewer ? 'REPAIRER' : 'CLIENT') ??
                      (isTargetViewer
                        ? quoteRequestTargetLabel(quoteRequest, d.status, false)
                        : quoteRequestLabel(quoteRequest, d.status, false))}
                  </Text>
                )}
                {quoteRequest.closedReason === 'DECLINED' && quoteRequest.declineNote && (
                  <Text style={[styles.body, { color: palette.ink, marginTop: spacing.sm }]}>
                    « {quoteRequest.declineNote} »
                  </Text>
                )}
                {d.status === 'OPEN' && quoteRequest.expiresAt && (
                  <Text style={[styles.body, { color: palette.muted, marginTop: 4 }]}>
                    Sans réponse, elle expire le {quoteExpiryDay(quoteRequest.expiresAt)}.
                  </Text>
                )}
                {quoteRequest.preferredTravel && (
                  <Text style={[styles.body, { color: palette.muted, marginTop: spacing.sm }]}>
                    Mode souhaité : {quoteRequest.preferredTravel === 'HOME' ? 'À domicile' : 'En atelier'}
                  </Text>
                )}
                {quoteRequest.details && (
                  <Text style={[styles.body, { color: palette.ink, marginTop: spacing.sm }]}>
                    {quoteRequest.details}
                  </Text>
                )}

                {quoteActions && (
                  <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                    {quoteActions.canViewQuote && (
                      // The quote is an ordinary offer: « Accepter » is the offer card's existing
                      // checkout on the offres screen, so there is one accept path, not two.
                      <Button
                        label="Voir le devis et accepter"
                        onPress={() => router.push(`/demande/${d.id}/offres`)}
                      />
                    )}
                    {quoteActions.canRefuseQuote && (
                      <Button
                        label="Refuser le devis"
                        variant="secondary"
                        loading={refuseQuote.isPending}
                        onPress={() => runQuote(() => refuseQuote.mutateAsync())}
                      />
                    )}
                    {quoteActions.canCancel && (
                      <Button
                        label="Annuler la demande"
                        variant="text"
                        loading={cancelQuote.isPending}
                        onPress={() => runQuote(() => cancelQuote.mutateAsync())}
                      />
                    )}
                    {quoteActions.canDecline && !declineOpen && (
                      <Button
                        label="Refuser la demande"
                        variant="secondary"
                        onPress={() => {
                          setQuoteError(null);
                          setDeclineOpen(true);
                        }}
                      />
                    )}
                    {quoteActions.canDecline && declineOpen && (
                      <View>
                        <Field
                          label="Raison du refus"
                          value={declineNote}
                          onChangeText={setDeclineNote}
                          helperText="Le client la verra."
                          counter={{ current: declineNote.length, max: 300 }}
                          multiline
                          minHeight={80}
                        />
                        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                          <View style={{ flex: 1 }}>
                            <Button label="Retour" variant="secondary" onPress={() => setDeclineOpen(false)} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Button
                              label="Confirmer le refus"
                              loading={declineQuote.isPending}
                              onPress={submitDecline}
                            />
                          </View>
                        </View>
                      </View>
                    )}
                  </View>
                )}
                {quoteError !== null && (
                  <Text style={[styles.bodyStrong, { color: palette.red, marginTop: spacing.sm }]}>
                    {quoteError}
                  </Text>
                )}
                {/* The target reached it in client mode (a push tap lands in whichever mode he
                    left the app in). Say how to answer rather than showing no buttons at all. */}
                {d.status === 'OPEN' &&
                  quoteRequest.repairer.userId === me?.id &&
                  activeMode !== 'REPAIRER' && (
                    <Text style={[styles.body, { color: palette.muted, marginTop: spacing.sm }]}>
                      Passez en mode réparateur pour répondre à cette demande.
                    </Text>
                  )}
              </Card>
            )}

            {/* Photo gallery. When photoUrls is empty, render nothing: no placeholder, no
                empty frame. Today every demande has zero photos, so a placeholder would be the
                only thing most demandes show. The absence is deliberate. */}
            {d.photoUrls.length > 0 && (() => {
              // Clamp activePhotoIndex to the last valid index. photoUrls can come back SHORTER
              // than before on a refetch (a URL whose object has vanished is omitted), so any
              // stored index must be treated as a hint rather than an address. Clamping rather
              // than resetting preserves a deliberate selection on an ordinary refetch.
              const safeIndex = Math.min(activePhotoIndex, d.photoUrls.length - 1);
              return (
                <View style={{ marginBottom: spacing.lg }}>
                  <View style={[styles.cover, { borderRadius: radii.card }]}>
                    {/* URLs are signed and expire after one hour. A screen left open longer will
                        show a blank image. Refresh is deliberately out of scope. */}
                    <Image
                      source={{ uri: d.photoUrls[safeIndex] }}
                      style={styles.coverImage}
                      resizeMode="cover"
                    />
                  </View>
                  {/* Thumbnail row: only rendered when there are multiple photos. A single photo
                      gets no thumbnail row at all. */}
                  {d.photoUrls.length > 1 && (
                    <View style={styles.thumbRow}>
                      {d.photoUrls.map((url, index) => (
                        <Pressable
                          key={url}
                          accessibilityRole="button"
                          accessibilityLabel={`Photo ${index + 1}`}
                          onPress={() => setActivePhotoIndex(index)}
                        >
                          <View
                            style={[
                              styles.thumb,
                              {
                                opacity: index === safeIndex ? 1 : 0.6,
                                borderWidth: index === safeIndex ? 2 : 0,
                                borderColor: accent.accent,
                              },
                            ]}
                          >
                            <Image
                              source={{ uri: url }}
                              style={styles.thumbImage}
                              resizeMode="cover"
                            />
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              );
            })()}

            {/* The category, then the pricing posture as the one dark badge on the screen.
                « Recherche d'offres » and NOT « 0 € » with no budget: an OFFERS-mode demande has
                no price yet, which is an invitation to quote, where a zero would read as the
                client's ceiling. */}
            <View style={styles.badgeRow}>
              <Badge tone="neutral" label={d.category.labelFr} />
              <Badge
                tone="dark"
                label={
                  d.mode === 'BUDGET' && d.budgetCents !== null
                    ? isPrivate
                      ? `Budget indicatif ${euros(d.budgetCents)}`
                      : `Budget ${euros(d.budgetCents)}`
                    : 'Recherche d’offres'
                }
              />
            </View>

            {/* 19/700, per the prototype. Deliberately NOT `type.screenTitle` (26/700): that
                token is for a screen's own title, and this screen's title is in the header. */}
            <Text style={[styles.title, { color: palette.ink }]}>{d.title}</Text>

            {/* « Apple iPhone 13 ». Both columns are nullable, so the line is dropped entirely
                rather than rendering an em dash where a device name belongs. */}
            {[d.brand, d.model].some(Boolean) && (
              <Text style={[styles.subtitle, { color: palette.muted }]}>
                {[d.brand, d.model].filter(Boolean).join(' ')}
              </Text>
            )}

            <View style={[styles.badgeRow, { marginTop: spacing.md }]}>
              {/* Location, with the distance appended only when there is one. `distanceKm` is
                  null until the réparateur saves a postal code, so the badge degrades to the
                  town rather than trailing a « · ». */}
              <View style={[styles.locationBadge, { backgroundColor: palette.mist }]}>
                <IconLocation size={12} color={palette.muted} strokeWidth={2.4} />
                <Text style={[styles.locationText, { color: palette.muted }]}>
                  {(() => {
                    const loc = isAuthor ? d.locationLabel : formatPublicLocation(d.locationLabel, d.postalCode);
                    return distanceKm === null ? loc : `${loc} · ${distanceKm} km`;
                  })()}
                </Text>
              </View>
              <Badge tone="neutral" label={PARTS_LABEL[d.parts]} />
            </View>

            {/* The problem, as prose. It was a « Problème » label/value Row, which framed the
                one thing a réparateur actually reads as a field in a form. */}
            <Text style={[styles.description, { color: palette.ink }]}>{d.description}</Text>

            {/* The CLIENT card, suppressed for the author - nobody needs a card about
                themselves. No rating: none exists for a client. */}
            {author !== null && (
              <Card style={{ marginTop: spacing.lg }}>
                <Text style={[styles.eyebrow, { color: palette.muted }]}>CLIENT</Text>
                <Text style={[styles.clientName, { color: palette.ink }]}>
                  {authorUsername ? publicIdentity({ username: authorUsername, displayName: null }) : 'Client'}
                </Text>
                <Text style={[styles.clientMeta, { color: palette.muted }]}>
                  Membre depuis {new Date(author.memberSince).getFullYear()}
                </Text>
                <View style={styles.lockRow}>
                  <IconLock size={12} color={palette.muted} strokeWidth={2.2} />
                  <Text style={[styles.lockText, { color: palette.muted }]}>
                    Coordonnées visibles après acceptation d&apos;une offre.
                  </Text>
                </View>
              </Card>
            )}
          </View>
        )}
      </ScrollView>
        </KeyboardAvoider>
      )}

      {/* Fixed CTA, following `reparateur/[userId].tsx`: paper ground with a top border rather
          than the prototype's white gradient fade, which would need `expo-linear-gradient` - a
          native module, and therefore a build. */}
      {offerTarget !== null && (
        <View
          style={[
            styles.ctaBar,
            { backgroundColor: palette.paper, borderTopColor: palette.line },
            {
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
              // The prototype's own `calc(env(safe-area-inset-bottom) + 20px)`. The screen's
              // SafeAreaView covers `top` only, so a bar pinned to bottom: 0 would otherwise sit
              // under the home indicator on every device that has one.
              paddingBottom: insets.bottom + 20,
            },
          ]}
        >
          {identityBlocked ? (
            <>
              {/* 🛑 `variant="locked"`, NOT `disabled`. `disabled` sets `disabled` on the
                  Pressable, so `onPress` would never fire and the sheet would be unreachable -
                  a dimmed control that does nothing reads as a broken app. The client drew this
                  CTA locked with a reason beneath it precisely so a réparateur learns the rule
                  BEFORE filling in a form. */}
              <Button
                variant="locked"
                label={isPrivate ? 'Envoyer un devis' : d?.mode === 'BUDGET' ? 'Envoyer une demande' : 'Faire une offre'}
                icon={<IconLock size={16} color={palette.paper} strokeWidth={2.2} />}
                onPress={() => setGateVisible(true)}
              />
              <View style={styles.lockedHint}>
                <IconShieldCheck size={13} color={palette.muted} strokeWidth={2.2} />
                <Text style={[styles.lockedHintText, { color: palette.muted }]}>
                  {offerBlockReason === 'BASIC'
                    ? 'Compte confirmé requis'
                    : offerBlockReason?.startsWith('BUSINESS')
                      ? 'Entreprise vérifiée requise'
                      : 'Identité vérifiée requise'}
                </Text>
              </View>
            </>
          ) : (
            <Button
              label={isPrivate ? 'Envoyer un devis' : d?.mode === 'BUDGET' ? 'Envoyer une demande' : 'Faire une offre'}
              onPress={() => router.push(`/demande/${offerTarget}/offre`)}
            />
          )}
        </View>
      )}

      {offerBlockReason !== null && (
        <OfferGateSheet
          visible={gateVisible}
          block={offerBlockReason}
          onDismiss={() => setGateVisible(false)}
          onVerifyIdentity={identityStart.startIdentity}
          error={identityStart.error}
          verifying={identityStart.loading}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14 },
  bodyStrong: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 14 },

  /**
   * `CF-53`. The header's heart + share pair. `gap: 16` is `spacing.lg` written as a literal
   * because a `StyleSheet` is module scope and cannot read the theme hook - the same reason
   * `thumbRow` and `badgeRow` below carry literals. **It is a touch-target constraint, not a
   * spacing choice: both controls use `hitSlop={8}`, so anything under 16 makes their tap areas
   * overlap.** See the `right` prop above for the full reasoning and the measured positions.
   */
  headerControls: { flexDirection: 'row', alignItems: 'center', gap: 16 },

  cover: { width: '100%', height: 200, borderCurve: 'continuous', overflow: 'hidden' },
  coverImage: { width: '100%', height: 200 },
  thumbRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  thumb: { width: 60, height: 60, borderRadius: 12, borderCurve: 'continuous', overflow: 'hidden' },
  thumbImage: { width: 60, height: 60 },

  /** `flexWrap`, because the second row can hold a long town name beside a parts label. */
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },

  title: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 19, lineHeight: 24, marginTop: 12 },
  subtitle: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, marginTop: 4 },

  /**
   * A hand-built chip rather than `Badge`, because this one holds an icon and `Badge` takes a
   * label only. Its padding and radius are copied from `Badge.base` so the two sit level in the
   * same row - the one place in this file where a value is duplicated on purpose.
   */
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 8,
  },
  locationText: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 11, letterSpacing: 0.2 },

  description: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14.5, lineHeight: 22, marginTop: 16 },

  eyebrow: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 11, letterSpacing: 1.6 },
  clientName: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 15, marginTop: 8 },
  clientMeta: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12.5, marginTop: 2 },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  lockText: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 11.5, flex: 1 },

  ctaBar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1 },
  lockedHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 },
  lockedHintText: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12 },
});
