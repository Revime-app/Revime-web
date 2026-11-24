import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { useSessionContext } from '../../src/lib/session';
import { useIdentityStatus } from '../../src/lib/queries';
import { useIdentityStart } from '../../src/lib/use-identity-start';
import { useRepairerJourney } from '../../src/lib/use-repairer-journey';
import { api, ApiError } from '../../src/lib/api';
import { Confetti } from '../../src/components/Confetti';
import { IconTick } from '../../src/icons';
import { identityRefusalReasonFr } from '@revime/shared';
import type { MeResponse } from '@revime/shared';

export default function IdentiteRetour() {
  const router = useRouter();
  const { palette, spacing, accent } = useTheme();
  const insets = useSafeAreaInsets();
  const { me, refresh } = useSessionContext();
  const [error, setError] = useState<string | null>(null);

  /**
   * 🛑 THE FLAG ALONE, NOT `repairerEnabled && connectEnabled`. Corrected 2026-09-04 (`CF-55`),
   * and the old guard made this screen's whole subject unreachable.
   *
   * The server used to gate BECOMING a réparateur on identity (`'become'`, removed in CF4-01),
   * so the order was verify → become. Since CF4-01 he is usually `repairerEnabled` already, but
   * a user may still return from Stripe without it, and for that user the old condition
   * disabled the query, nothing ever resolved to `VERIFIED`, and he sat on « Documents
   * envoyés » permanently. « Félicitations ! » could never render for exactly the user
   * mockup `04` panel 4 is about.
   *
   * `GET /identity/status` carries NO réparateur guard (`identity.controller.ts` - session
   * only), so asking for it here is a request the server answers. `connectEnabled` stays
   * because `isConnectEnabled()` gates the whole identity subsystem and the route 422s without
   * it; that half of the old condition was right.
   */
  const identityAvailable = Boolean(me?.connectEnabled);
  const identityStatus = useIdentityStatus(identityAvailable);
  const identityStart = useIdentityStart({
    navigateToReturn: false,
    onSuccess: () => {
      void identityStatus.refetch();
    },
  });
  const { journey } = useRepairerJourney();
  const [becoming, setBecoming] = useState(false);

  useEffect(() => {
    if (identityAvailable) {
      void identityStatus.refetch();
    }
    void refresh();
  }, [identityAvailable, refresh]);

  // CF4-39: REVIME's decision on the current session. `?? null`: a stale API sends undefined.
  const decision = identityStatus.data?.decision ?? null;
  const decisionReason = identityStatus.data?.decisionReason ?? null;
  // A refused session still reads VERIFIED: the decision must win, or this screen celebrates a
  // verification REVIME withdrew.
  const isVerified = identityStatus.data?.status === 'VERIFIED' && decision === null;
  /**
   * WHICH of the two verified states he is in, and the distinction is what stops a false claim.
   * Panel 4's second row reads « Profil activé », which is true only of a réparateur -
   * `repairerEnabled` is precisely what made the old guard "correct by accident". So the row
   * and the CTA follow this, rather than the guard being simply dropped.
   */
  const isRepairer = me?.profile.repairerEnabled === true;
  const hasFailed =
    decision !== null ||
    (identityStatus.data?.status === 'REQUIRES_INPUT' && Boolean(identityStatus.data.lastErrorCode));

  const handleRetry = () => {
    setError(null);
    void identityStart.startIdentity();
  };

  /**
   * « Commencer » for a réparateur-to-be who has just verified: enable the mode, then land on
   * Profil. (Design spec §4.6, D2: payouts moved to the end of the journey, so Profil - not a
   * payout card - is what follows here; this branch is unchanged from before that reordering,
   * it simply no longer implies payouts are next.)
   *
   * 🛑 THE SAME `PATCH` `app/parametres/index.tsx` MAKES, and the two branches must stay in
   * step: `repairerEnabled: true` plus `activeMode: 'REPAIRER'`, because enabling the mode and
   * entering it are one action from the user's point of view. Payout onboarding is NOT called
   * here - `POST /connect/onboarding` keeps its own `repairerEnabled` guard, so it would 403
   * for this user until the PATCH lands.
   *
   * 🛑 `refresh()`, NEVER `invalidateQueries(['me'])`. There is no `useQuery` on `['me']` in
   * this app - the session is `useState` inside `SessionProvider` and only `refresh()` updates
   * it, so a cache invalidation here would silently leave the screen on stale state. That trap
   * cost a whole slice on 2026-09-01; `queries.ts` records it.
   */
  const handleBecomeRepairer = async () => {
    setError(null);
    setBecoming(true);
    try {
      await api.patch<MeResponse>('/users/me/modes', {
        repairerEnabled: true,
        activeMode: 'REPAIRER',
      });
      await refresh();
      router.push('/(tabs)/profil');
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "L'activation n'a pas pu aboutir. Réessayez.",
      );
    } finally {
      setBecoming(false);
    }
  };

  /**
   * « Continuer » for a réparateur who has just verified: identity is no longer the last step
   * (payouts moved off this screen under D2, design spec §4.6), so this resumes the journey at
   * whichever step is next rather than jumping straight to payout onboarding. While `journey` is
   * still loading (null) the hub itself resolves what is next, including an already-complete
   * journey; `journey?.complete === true` is the only case this screen decides on its own, and it
   * routes to Profil instead of back into the hub.
   */
  const handleContinuer = async () => {
    await refresh();
    if (journey?.complete === true) {
      router.push('/(tabs)/profil');
    } else {
      router.replace('/statut-verification');
    }
  };

  const handleRetourAuProfil = async () => {
    await refresh();
    router.push('/(tabs)/profil');
  };

  /**
   * 🛑 KNOWN LIMITATION, DELIBERATELY NOT PLUMBED AROUND. Stripe Identity takes minutes, so if
   * it completes while the app is backgrounded or closed the réparateur reopens to Profil
   * already verified and NEVER SEES THIS SCREEN - this route is reached only by returning from
   * the Stripe web session.
   *
   * Landing it reliably needs a persisted « celebrated » flag or an IDENTITY_VERIFIED
   * NotificationType (a migration, the shared enum, and BOTH consumers - and note only the
   * total `ICON_FOR` map would fail to compile, while `destinationFor`'s switch default would
   * silently route nowhere). Neither is built, because this screen is UNREACHABLE IN PRODUCTION
   * until live Identity is on, so that plumbing would be speculative. See the spec's §5.6 and
   * PROJECT_ROADMAP.md's follow-ups.
   */
  if (isVerified) {
    return (
      <View style={[styles.screen, { backgroundColor: palette.paper, paddingTop: insets.top }]}>
        <Confetti />
        <View style={[styles.celebrate, { paddingHorizontal: spacing.xl }]}>
          <View style={[styles.halo, { backgroundColor: palette.greenSoft }]}>
            <View style={[styles.check, { backgroundColor: palette.greenDeep }]}>
              <IconTick size={30} color={palette.paper} strokeWidth={3} />
            </View>
          </View>

          <Text style={[styles.celebrateTitle, { color: palette.ink }]}>Félicitations&nbsp;!</Text>

          {/* First sentence is the client's, verbatim. The second used to be his own
              « Vous pouvez maintenant proposer vos services sur Revime. », then became
              « Configurez vos virements pour pouvoir être payé. » when identity and payouts were
              one two-step journey. Design spec §4.6 (D2, 2026-09-29): payouts are no longer the
              step after identity, so the sentence now points at the journey generally rather than
              naming virements specifically. This deviation is OWED TO THE CLIENT and is recorded
              in the spec's §8 - it is not to be sent mid-round.

              🛑 TWO `<Text>` ELEMENTS, NOT ONE STRING, AND THAT IS A MEASURED FIDELITY FIX RATHER
              THAN A STYLE CHOICE. Corrected 2026-09-01. The two sentences were measured
              INDIVIDUALLY (227.2pt and 337.8pt against 327.0pt) and the conclusion « three lines,
              1 + 2, which is what panel 4 draws » was written from that - but as ONE string the
              wrap ignores the sentence boundary entirely and it renders as TWO lines:
                line 1  « Votre profil réparateur est activé. Configurez »   307.0pt of 327.0
                line 2  « vos virements pour pouvoir être payé. »            258.0pt of 327.0
              i.e. « Configurez » is orphaned up onto line 1 and panel 4's shape is lost. Giving
              each sentence its own `<Text>` makes each one start its own line, which restores the
              1 + 2 the mockup draws. `marginTop: 0` on the second: `celebrateBody` carries
              `marginTop: 10` to separate the body from the title, and repeating it here would open
              a gap INSIDE what the client drew as one paragraph.

              🛑 THE SECOND SENTENCE BELOW (2026-09-29 CF4-08/09) IS NOT MEASURED. The width figures
              in the StyleSheet comment below describe the RETIRED « Configurez vos virements pour
              pouvoir être payé. » line, taken before this change; « Terminez la configuration de
              votre profil réparateur. » has not been measured against the shipped TTFs and no
              measurement for it is claimed here. It keeps the same two-`<Text>` shape and the same
              `numberOfLines` restriction as the sentence it replaces, on the same reasoning, but the
              exact line count it wraps to is unverified. */}
          {/* 🛑 TWO VARIANTS, ADDED 2026-09-04 (`CF-55`), because the screen now renders for a
              réparateur AND for someone who verified BEFORE becoming one. Each keeps the
              two-`<Text>` shape and each measures to panel 4's 1 + 2 body. Measured with PIL
              12.3.0 against the shipped TTFs from the repo root, at `celebrateBody`'s own
              15pt/400 in 327.0pt, with glyph coverage proven from the cmap rather than from an
              advance width (a `.notdef` advance is indistinguishable from a real 9pt glyph):
                « Votre identité est vérifiée. »                        176.0pt  1 line
                « Activez le mode réparateur pour proposer vos services. » 381.0pt  2 lines
                                                          greedy: 316.0 + 62.0
              The figures on the older two sentences in the StyleSheet below were taken with a
              different PIL build and are left as they were rather than restated here. */}
          {isRepairer ? (
            <>
              <Text style={[styles.celebrateBody, { color: palette.muted }]}>
                Votre profil réparateur est activé.
              </Text>
              <Text style={[styles.celebrateBody, { color: palette.muted, marginTop: 0 }]}>
                Terminez la configuration de votre profil réparateur.
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.celebrateBody, { color: palette.muted }]}>
                Votre identité est vérifiée.
              </Text>
              <Text style={[styles.celebrateBody, { color: palette.muted, marginTop: 0 }]}>
                Activez le mode réparateur pour proposer vos services.
              </Text>
            </>
          )}

          {/* 🛑 `alignSelf: 'center'` ON THE BLOCK, LEFT-ALIGNED ROWS INSIDE IT. Corrected
              2026-09-01. This was `alignSelf: 'stretch'` with `justifyContent: 'center'` on each
              ROW, so the two rows centred INDEPENDENTLY - and the labels are 98.5pt and 74.0pt at
              13.5pt/500, so the two ticks sat about 12pt apart horizontally and read as a
              misalignment rather than a list. Centring the CONTAINER (whose width is now its widest
              row) and letting the rows start at its left edge puts both ticks on one vertical. */}
          <View style={{ marginTop: spacing.xl, alignSelf: 'center' }}>
            {/* 🛑 « Profil activé » IS CONDITIONAL, 2026-09-04 (`CF-55`). It is a CLAIM about the
                account, and it is false for someone who verified before enabling the mode - the
                class `apps/mobile/AGENTS.md` bans. Dropping the old `repairerEnabled` query guard
                without this would have shipped exactly that false row, which is why the spec
                called the old guard "correct by accident" rather than simply wrong. */}
            {(isRepairer
              ? [{ key: 'identity', label: 'Identité vérifiée' }, { key: 'profile', label: 'Profil activé' }]
              : [{ key: 'identity', label: 'Identité vérifiée' }]
            ).map((r) => (
              <View key={r.key} style={[styles.checkRow, { marginBottom: spacing.sm }]}>
                <IconTick size={16} color={palette.greenDeep} strokeWidth={2.6} />
                <Text style={[styles.checkRowText, { color: palette.ink }]}>{r.label}</Text>
              </View>
            ))}
          </View>

          {error !== null && (
            <Text style={[styles.error, { color: palette.redDeep, marginTop: spacing.md }]}>
              {error}
            </Text>
          )}

          <View style={{ marginTop: spacing.xl, alignSelf: 'stretch' }}>
            {/* 🛑 `loading` ADDED 2026-09-01, and it is a billing guard rather than polish. Without
                it the mode-enabling PATCH had no feedback, and `Button` only sets `disabled` on its
                `Pressable` when `loading` (or `disabled`) is passed - so a double tap fired the
                mutation twice. Every one of the other async CTAs in this app passes `…isPending` or
                an equivalent flag; this button was briefly the exception on the réparateur branch
                until that branch stopped writing anything (2026-09-29, see below). */}
            {/* The client's own CTA label for someone not yet a réparateur enables the mode
                (unchanged, `handleBecomeRepairer`). For a réparateur, « Continuer » resumes the
                journey at whichever step is next (design spec §4.6, D2, 2026-09-29) - identity is
                no longer followed by payout onboarding specifically, so this button no longer
                calls `/connect/onboarding` itself; the hub it routes to owns that. `loading` is a
                double-tap guard on the write in the non-réparateur branch only; the réparateur
                branch is a plain navigation and needs none. */}
            <Button
              label={isRepairer ? 'Continuer' : 'Commencer'}
              onPress={isRepairer ? handleContinuer : handleBecomeRepairer}
              loading={isRepairer ? false : becoming}
            />
          </View>

          {/* 🛑 AN EXPLICIT EXIT, RESTORED 2026-09-01, AND ITS ABSENCE WAS A DEAD END. The plain
              `VERIFIED` card this branch replaced carried a « Retour au profil » button and the
              restyle dropped it with nothing in its place. `app/_layout.tsx` sets
              `headerShown: false` GLOBALLY and this screen renders no `ScreenHeader` - that
              bare-chrome look is exactly what makes it match mockup `04` panel 4 - so a réparateur
              who declines to continue had no way off this screen but the OS back gesture.

              SECONDARY, and deliberately beneath: for a réparateur the primary is now « Continuer »,
              resuming the journey (`handleContinuer`, above) rather than opening payout setup
              directly - identity is no longer the step before payouts (D2). This button is the
              same plain exit to Profil in both variants, unmeasured against the new labels. */}
          <View style={{ marginTop: spacing.sm, alignSelf: 'stretch' }}>
            <Button
              label="Retour au profil"
              variant="secondary"
              onPress={() => void handleRetourAuProfil()}
            />
          </View>
        </View>
      </View>
    );
  }

  let heading = 'Documents envoyés';
  let body = 'Stripe vérifie votre pièce d\'identité. Cela prend généralement quelques minutes.';
  if (hasFailed) {
    heading =
      decision === 'DOCUMENTS_REQUESTED' ? 'Nouveaux documents demandés' : 'Vérification échouée';
    // CF4-39: REVIME's motif when an operator decided, else Stripe's reason.
    body = decisionReason ?? identityRefusalReasonFr(identityStatus.data?.lastErrorCode ?? null);
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.paper, paddingTop: insets.top }]}>
      <View style={[styles.container, { paddingHorizontal: spacing.lg }]}>
        <Card>
          <Text style={[styles.heading, { color: palette.ink }]}>
            {heading}
          </Text>
          <Text style={[styles.body, { color: palette.muted }]}>
            {body}
          </Text>
          {/* 🛑 `palette.redDeep`, NOT `accent.accentDeep`. This is a GENUINE FAILURE message
              (« La configuration n'a pas pu démarrer. »), not a status label. `accent.accentDeep` is
              `navyDeep` (`#010524`) in réparateur mode, against body ink `#141414`, so the error reads
              as body text. This follows the SAME functional-status-colour rule as CF-10's `IdentityGateSheet.tsx` (V8 E1: `OfferGateSheet.tsx`)
              one file over, whose fix wave corrected it on 2026-09-01. */}
          {(error || identityStart.error) && (
            <Text style={[styles.error, { color: palette.redDeep }]}>
              {error || identityStart.error}
            </Text>
          )}
          {hasFailed ? (
            <Button label="Réessayer" onPress={handleRetry} loading={identityStart.loading} />
          ) : (
            <Button label="Retour au profil" onPress={() => void handleRetourAuProfil()} />
          )}
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 80,
  },
  heading: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 18,
    marginBottom: 12,
  },
  body: {
    fontSize: 13.5,
    lineHeight: 19.5,
    marginBottom: 16,
  },
  error: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  /**
   * MEASURED on a 375pt iPhone SE with `spacing.xl` (24pt) padding each side -> 327.0pt inner.
   * PIL `ImageFont.getlength` against the shipped TTFs, run from the REPO ROOT (`node_modules` is
   * hoisted; from `apps/mobile` it fails with `OSError: cannot open resource`, which reads like a
   * missing font). Re-measured 2026-09-01.
   *   « Félicitations ! »                    26pt/700  172.5pt in 327.0pt  +47.2%
   *   « Votre profil réparateur est activé. » 15pt/400  227.2pt in 327.0pt  +30.5%  single line
   *   « Configurez vos virements … payé. »   15pt/400  337.8pt in 327.0pt  WRAPS to 2 lines
   *                                            greedy: 297.2pt + 37.0pt
   *   « Identité vérifiée »                13.5pt/500   98.5pt in 303.0pt  +67.5%
   *   « Profil activé »                    13.5pt/500   74.0pt in 303.0pt  +75.6%
   *   « Commencer »                          15pt/600   89.5pt in 287.0pt  +68.8%
   *   « Retour au profil »                   15pt/600  112.2pt in 287.0pt  +60.6%
   * The two check-row availables are 303.0pt because `IconTick` at 16 plus an 8pt gap comes off the
   * 327; « Commencer » is 287.0pt because `Button` adds 20pt of padding each side.
   *
   * 🛑 THE BODY IS THREE LINES (1 + 2) ONLY BECAUSE IT IS TWO `<Text>` ELEMENTS. This block used to
   * conclude « THREE lines total (1 + 2), which is what panel 4 draws » from the two per-sentence
   * figures above, and that inference was WRONG: as one string the wrap ignores the sentence
   * boundary and renders 2 lines, orphaning « Configurez » onto line 1 at 307.0pt. See the note at
   * the body itself. **Measuring per sentence is not measuring the string you render.**
   *
   * 🛑 Neither half of the body may ever take numberOfLines={1}.
   */
  celebrate: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  halo: { width: 116, height: 116, borderRadius: 58, alignItems: 'center', justifyContent: 'center' },
  check: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  celebrateTitle: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 26, marginTop: 24, textAlign: 'center' },
  celebrateBody: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 15, lineHeight: 22, marginTop: 10, textAlign: 'center' },
  /**
   * NO `justifyContent` - see the note at the call site. Each row used to centre its own content
   * inside a full-width container, which put the two ticks ~12pt apart because the labels differ in
   * width (98.5pt vs 74.0pt). The centring now happens once, on the container.
   */
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkRowText: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13.5 },
});
