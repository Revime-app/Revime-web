import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme';
import { ScreenMotif } from '../../src/components/ScreenMotif';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { VerificationBanner } from '../../src/components/VerificationBanner';
import { BrandHeader } from '../../src/components/BrandHeader';
import { PromoBanner } from '../../src/components/PromoBanner';
import { CategoryTiles } from '../../src/components/CategoryTiles';
import { ActiveDemandeCard } from '../../src/components/ActiveDemandeCard';
import { TrustStrip } from '../../src/components/TrustStrip';
import { NearbyDemandeRow } from '../../src/components/NearbyDemandeRow';
import { RepairerActivityCard } from '../../src/components/RepairerActivityCard';
import { TipCard } from '../../src/components/TipCard';
import { RevimeLoader } from '../../src/components/lottie/RevimeLoader';
import { RevimeRefreshScrollView } from '../../src/components/RevimeRefreshScrollView';
import { useSessionContext } from '../../src/lib/session';
import {
  useMyDemandes,
  useMyOffers,
  useCategories,
  useFeed,
  useCommandes,
  useRepairer,
  useRepairerDashboard,
  useMarkDashboardSeen,
  useIdentityStatus,
} from '../../src/lib/queries';
import { VerificationPendingBanner } from '../../src/components/VerificationPendingBanner';
import { RepairerJourneyCard } from '../../src/components/RepairerJourneyCard';
import { useRepairerJourney } from '../../src/lib/use-repairer-journey';
import { useTourPage, useTourTarget } from '../../src/tour/use-tour';
import { useTabBarSpace } from '../../src/lib/use-tab-bar-space';
import { activeDemande } from '../../src/lib/demande-status';
import { headlineFontSize } from '../../src/lib/headline';
import { IconSearch, IconBriefcase, IconChevronRight } from '../../src/icons';
import {
  euros,
  isActiveCommande,
  isSameMonth,
  STEP_LABEL,
  repairStatus,
  repairerVerificationState,
  todoBadgeCount,
} from '@revime/shared';

/**
 * The empty-state card's height: `Card`'s 16pt padding top and bottom, a 15pt title line
 * and two 13pt body lines. Used to reserve the « Ma demande en cours » slot while the query
 * is in flight, so the section below does not jump when it resolves.
 */
const EMPTY_CARD_H = 16 * 2 + 21 + 4 + 18 * 2;

export default function Accueil() {
  const { palette } = useTheme();
  const { me } = useSessionContext();

  const activeMode = me?.profile.activeMode ?? 'CLIENT';

  if (activeMode === 'REPAIRER') {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
        <ScreenMotif v={1} variant="navy" />
        <RepairerHome />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenMotif v={1} variant="accent" />
      <ClientHome />
    </SafeAreaView>
  );
}

/**
 * The client's Accueil, rebuilt on 2026-08-20 to match the approved prototype
 * (`repareme-web/src/screens/Accueil.tsx`).
 *
 * It used to BE the demandes list - title « Mes demandes », subtitle, then every row.
 * That was not a partial version of this screen, it was a different screen: the
 * prototype's Accueil is a landing page whose seven sections lead somewhere, and it
 * surfaces exactly ONE demande. The full list moved to `/mes-demandes`.
 *
 * 🛑 CORRECTED 2026-09-04 (`CF-35`): the link under the card is NOT « whenever there is more
 * than one », which is what this comment said for a fortnight and what the tracker row and
 * the roadmap repeated. It is `total > 0 && (current === null || total > 1)` - so it also
 * shows when NOTHING is active, which is the state a client whose demandes are all finished
 * is in. Only two states hide it: no demandes at all, and exactly one demande which is the
 * active one already on screen. That is why `CF-35` needed no code: every demande is
 * reachable in client mode today. The `total > 1` half alone was a real defect and the
 * condition beside it records the state walk that caught it.
 *
 * `VerificationBanner` is kept and sits directly under the header rather than being
 * dropped for fidelity: it is the nudge toward BASIC, and burying it below three
 * marketing sections would be a regression in the one thing this screen already did.
 */
function ClientHome() {
  const { palette, accent, spacing, radii } = useTheme();
  const tabBarSpace = useTabBarSpace();
  const { width } = useWindowDimensions();
  const { me } = useSessionContext();
  const router = useRouter();
  const demandes = useMyDemandes();
  const categories = useCategories();

  const current = activeDemande(demandes.data);
  const total = demandes.data?.length ?? 0;

  // « Bonjour Léa » in the prototype. firstName is NULLABLE and is null on the owner's
  // own production account, so the greeting degrades to the bare salutation rather than
  // rendering « Bonjour null » or « Bonjour  ». Trimmed because a whitespace-only first
  // name would otherwise pass a truthiness check.
  const firstName = me?.firstName?.trim();
  const greeting = firstName ? `BONJOUR ${firstName.toUpperCase()}` : 'BONJOUR';
  const headlineSize = headlineFontSize(width - spacing.lg * 2);
  // V8 E2: Accueil's bubbles wait for « Ma demande en cours » so nothing shifts under the spotlight.
  const tour = useTourPage('accueil', !demandes.isPending);
  const searchTarget = useTourTarget('homeSearch');
  const bannerTarget = useTourTarget('promoBanner');

  return (
    <>
      <BrandHeader mode="CLIENT" />
      <RevimeRefreshScrollView
        {...tour.scrollProps}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: tabBarSpace,
        }}
        onRefresh={() => demandes.refetch()}
      >
        <VerificationBanner />

        <Text style={[styles.eyebrowRed, { color: palette.red }]}>{greeting}</Text>
        {/* EXACTLY TWO LINES on every screen width. Three mechanisms, each doing a
            different job - see `headlineFontSize` for why one is not enough:
              numberOfLines={2}   the hard cap. No width can produce a third line.
              headlineSize        a width-derived size, so it FITS rather than truncates.
              adjustsFontSizeToFit iOS shrinks further if the estimate is still a hair
                                  too wide, so the cap never has to ellipsize. */}
        <Text
          style={[styles.h1, { color: palette.ink, fontSize: headlineSize, lineHeight: headlineSize * 1.12 }]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          Une réparation ?{'\n'}Comparez, puis choisissez.
        </Text>

        {/* A button dressed as an input, exactly as the prototype does it: there is no
            search ON this screen, and a real TextInput here would imply results below. */}
        <Pressable
          {...searchTarget}
          accessibilityRole="button"
          accessibilityLabel="Rechercher une réparation"
          onPress={() => router.push('/recherche')}
          style={[
            styles.searchBar,
            { backgroundColor: palette.mist, borderColor: palette.line, borderRadius: radii.field },
          ]}
        >
          <IconSearch size={18} color={palette.faint} strokeWidth={2.2} />
          <Text style={[styles.searchText, { color: palette.faint }]}>
            Rechercher une réparation…
          </Text>
        </Pressable>

        <View {...bannerTarget}>
          <PromoBanner onPress={() => router.push('/publier')} />
        </View>

        <CategoryTiles
          categories={categories.data}
          isError={categories.isError}
          onPickCategory={(categoryId) => router.push(`/publier?categoryId=${categoryId}`)}
          onSeeAll={() => router.push('/recherche')}
        />

        <Text style={[styles.eyebrow, { color: palette.faint, marginTop: spacing.xl }]}>
          MA DEMANDE EN COURS
        </Text>

        {/* minHeight holds this slot open while `/demandes/mine` is in flight, for the same
            reason CategoryTiles reserves its row: every query on this screen round-trips to
            production Postgres in Paris, measured at ~950ms cold, and without a reserved
            height the trust strip below jumps up and then back down. Sized to the
            empty-state card, which is what a client with no demandes lands on. A populated
            card is taller and still grows the slot - accepted, because holding the taller
            height would leave a visible gap in the far more common empty case. */}
        {demandes.isPending && (
          <View style={{ minHeight: EMPTY_CARD_H, justifyContent: 'center', alignItems: 'center' }}>
            <RevimeLoader variant="fill" size={64} />
          </View>
        )}

        {demandes.isError && (
          <Text style={[styles.bodyStrong, { color: palette.red }]}>
            Impossible de charger vos demandes. Tirez vers le bas pour réessayer.
          </Text>
        )}

        {!demandes.isPending && !demandes.isError && current === null && (
          <Card>
            <Text style={[styles.emptyTitle, { color: palette.ink }]}>
              Aucune demande en cours
            </Text>
            {/* « votre première demande » is only true when there has never been one.
                A client whose only demande is terminée has published before, so the
                copy switches rather than telling him something he knows is wrong. */}
            <Text style={[styles.emptyBody, { color: palette.muted }]}>
              {total === 0
                ? 'Appuyez sur le bouton central pour publier votre première demande.'
                : 'Appuyez sur le bouton central pour en publier une nouvelle.'}
            </Text>
          </Card>
        )}

        {current !== null && (
          <ActiveDemandeCard
            demande={current}
            status={repairStatus(
              {
                demandeStatus: current.status,
                offerCount: current.offerCount,
                // Forward compatibility: distinguish absent (old API) from null (no commande exists).
                // An absent key degrades to null rather than client index 0, suppressing the offer count.
                commande: 'commande' in current ? current.commande : null,
              },
              'CLIENT',
            )}
            onPress={() => router.push(`/demande/${current.id}/offres`)}
            onPressCommande={() => router.push(`/commandes`)}
          />
        )}

        {/* Shown whenever the list holds something this screen is NOT already showing.
            `total > 1` alone was wrong and a state walk caught it: a client whose only
            demande is DONE gets `current === null`, so the card is replaced by the empty
            state and a `total > 1` link would hide too - leaving that demande reachable
            from nowhere on this screen. */}
        {total > 0 && (current === null || total > 1) && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/mes-demandes')}
            style={{ paddingVertical: spacing.md }}
          >
            <Text style={[styles.seeAll, { color: accent.accent }]}>
              Voir toutes mes demandes ({total})
            </Text>
          </Pressable>
        )}

        <TrustStrip onPress={() => router.push('/reparateurs-verifies')} />
        <TipCard mode="CLIENT" />
      </RevimeRefreshScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  eyebrow: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 11, letterSpacing: 1.6, marginBottom: 10 },
  eyebrowRed: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 11, letterSpacing: 1.6 },
  /**
   * `.h1` in the prototype is weight **600**, not 700 (`styles.css:182-189`), with
   * `line-height: 1.12`. Deliberately NOT `type.screenTitle` (26/700): that token is for
   * screen titles like « Mes demandes », and this is the marketing headline.
   *
   * `fontSize` and `lineHeight` are deliberately ABSENT here and supplied inline from
   * `headlineFontSize(width)`, because they depend on the screen width. Leaving stale
   * values here as well would be two sources of truth for one number, and the inline one
   * silently wins - the shape of bug this codebase keeps recording.
   */
  h1: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: -0.8,
    marginTop: 6,
    marginBottom: 18,
  },
  /**
   * `.search-bar__input`: 1.5px `--line` border, `--mist` fill, `--r-field` radius,
   * 15px text. The prototype pads left 42 to clear an absolutely-positioned icon; a flex
   * row with a gap reaches the same result without the absolute positioning.
   */
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 4,
  },
  searchText: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 15 },
  seeAll: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13.5 },
  body: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14 },
  bodyStrong: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 14 },
  emptyTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15 },
  emptyBody: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, marginTop: 4 },

  /**
   * The réparateur greeting. Deliberately NOT the client's red eyebrow plus marketing
   * headline: AccueilPro opens with a small muted salutation over the name at display size
   * (`AccueilPro.tsx:33-36`), which is a greeting rather than a pitch. A réparateur opening
   * the app is already a user, so there is nothing to sell him.
   */
  hello: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13 },
  helloName: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 24, letterSpacing: -0.24 },

  commandeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commandeTitle: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 13.5 },
  commandeStep: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 11.5, marginTop: 3 },
  commandePrice: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 15 },
});

/**
 * The réparateur's Accueil, rebuilt on 2026-08-20 to match the approved prototype
 * (`repareme-web/src/screens/AccueilPro.tsx`).
 *
 * It used to BE the offers list - title « Mes propositions », subtitle, then every offer.
 * That is the same mistake the client's Accueil carried until one day earlier, and the same
 * correction applies: the prototype's AccueilPro is a landing page whose sections lead
 * somewhere, and it shows no offers at all. The list moved to `/mes-propositions`.
 *
 * 🛑 CORRECTED IN BOTH HALVES ON 2026-08-30, and the first half had already been false for ten
 * days. This used to read « reachable from the activity card here and from a Profil row, exactly
 * as its Profil does (`repareme-web/src/screens/Profil.tsx:46`) ». The activity card has opened
 * « Tableau de bord » since 2026-08-20 and does NOT route here - the note on
 * `RepairerActivityCard` below recorded that change while this sentence never absorbed it. And
 * « a Profil row » stopped being a row: `CF-22` made it the « Mes propositions » TILE in Profil's
 * RACCOURCIS grid. That tile is now the ONE route to this screen anywhere in the app, verified by
 * grepping for the path rather than by reading.
 *
 * `VerificationBanner` is kept directly under the header rather than dropped for fidelity,
 * for the reason `ClientHome` records: it is the nudge toward BASIC, and burying it below
 * three sections would regress the one thing this screen already did well.
 *
 * 🛑 **This block used to say two prototype elements were deliberately absent as dead
 * affordances - the header's bell and the activity card's « Tableau de bord » link. BOTH
 * NOW EXIST and the note was false in both halves.** The bell arrived with the
 * notifications slice and lives in `BrandHeader`, routed to `/notifications`; the dashboard
 * arrived with `11ce961` and the activity card below opens it. Kept as a correction rather
 * than deleted, because "deliberately absent" is exactly the kind of claim a later reader
 * trusts instead of checking - and the reason it was absent (nothing to open) had stopped
 * being true well before this comment was read again.
 */
function RepairerHome() {
  const { palette, spacing, radii } = useTheme();
  const tabBarSpace = useTabBarSpace();
  const { me } = useSessionContext();
  const router = useRouter();

  /**
   * ONE `now` for the whole render, threaded into every child that formats a date.
   *
   * Not `new Date()` inside each card: two cards in the same frame would then format against
   * two different instants, and a row could read « il y a 1 min » beside one reading « à
   * l'instant » for the same timestamp. It is intentionally NOT state - this screen has no
   * ticking clock, and a refetch (pull-to-refresh, or remount on tab focus) re-renders with a
   * fresh one, which is when the labels should move anyway.
   */
  const now = new Date();

  /**
   * Same expression as `DemandeFeed`'s, deliberately identical rather than merely similar:
   * distance is real only once a postal code is saved, and this screen must agree with the
   * feed the « Voir tout » link opens.
   */
  const located = me?.repairer?.postalCode != null;

  /**
   * `useFeed({})` and NOT `{ sort: 'distance' }`, even though nearest-first is what this
   * section wants. Two reasons:
   *
   *  - the server already defaults to exactly that - `demandes.service.ts:277` resolves an
   *    absent sort to `from ? 'distance' : 'recentes'` - so naming it here would be a second
   *    copy of a decision the API owns, free to drift;
   *  - `{}` is the key the FAB feed uses, so this screen and « Voir tout » share ONE cache
   *    entry instead of fetching the same rows twice under different keys.
   */
  const feed = useFeed({});
  const offers = useMyOffers();
  const commandes = useCommandes('repairer');
  // CF4-G: the « À faire » count on the activity card. Same query and cache entry as the
  // Tableau de bord, so the badge and the section it opens cannot disagree. `?? []` at entry:
  // a stale API sends no `todo` (AGENTS.md). Null while pending / on error -> no pill.
  // CF5-15: Uses unseenTodoCount if present so opening the panel dismisses the pill until new items arrive.
  const dashboard = useRepairerDashboard(Boolean(me?.profile.repairerEnabled));
  const markDashboardSeen = useMarkDashboardSeen();
  const todoCount = dashboard.data
    ? (dashboard.data.unseenTodoCount ?? todoBadgeCount(dashboard.data.todo ?? []))
    : null;

  const offersThisMonth = (offers.data ?? []).filter((o) => isSameMonth(o.createdAt, now)).length;
  const active = (commandes.data ?? []).filter(isActiveCommande);

  // The réparateur's own rating, from his public profile. Reused rather than refetched: Profil
  // already reads this and TanStack Query serves both from one cache entry.
  const myProfile = useRepairer(me?.id ?? '');

  /**
   * CF4-01. The shared four-state derivation; gated on the SERVER's Connect flag, as Profil's MON
   * IDENTITÉ card is (identity start refuses IDENTITY_OFF otherwise). DTO fields through `?? null`
   * once, here.
   */
  const identityStatus = useIdentityStatus(
    Boolean(me?.profile.repairerEnabled && me?.connectEnabled),
  );
  const identityPending =
    me != null &&
    me.profile.repairerEnabled &&
    me.connectEnabled &&
    repairerVerificationState(
      me.profile.verificationLevel,
      me.repairer?.kind ?? null,
      identityStatus.data?.status ?? null,
      identityStatus.data?.lastErrorCode ?? null,
      // CF4-39: a refused user is never « en cours ». `?? null`: a stale API sends undefined.
      identityStatus.data?.decision ?? null,
    ).state === 'PENDING';
  // CF4-09: the journey hook drives `RepairerJourneyCard` below. `journeyComplete` also narrows
  // the standalone `identityPending` banner: while the journey is incomplete, the card is shown
  // and already embeds this same pending copy (spec §4.7, « one block, not two ») - so the
  // standalone banner is suppressed to avoid a duplicate. It only reappears once the journey is
  // fully done and the card itself stops rendering.
  const { journey } = useRepairerJourney();
  const journeyComplete = journey?.complete === true;
  // « Bonjour, Karim R. » - his PUBLIC name, which is what a réparateur is known by here.
  // Degrades to the first name and then to the bare salutation, because displayName is
  // absent for an account that has not finished réparateur setup and firstName is nullable
  // on the owner's own production account.
  const greetingName = me?.repairer?.displayName?.trim() || me?.firstName?.trim() || null;
  // V8 E2: wait for the journey (the card is there or not) and the nearby feed before spotlighting.
  const tour = useTourPage('accueil', journey !== null && !feed.isPending);
  const journeyTarget = useTourTarget('journeyCard');
  const nearbyTarget = useTourTarget('nearbyRow');

  return (
    <>
      <BrandHeader mode="REPAIRER" />
      <RevimeRefreshScrollView
        {...tour.scrollProps}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: tabBarSpace,
        }}
        onRefresh={() =>
          Promise.allSettled([
            feed.refetch(),
            offers.refetch(),
            commandes.refetch(),
            me?.profile.repairerEnabled ? dashboard.refetch() : Promise.resolve(),
          ])
        }
      >
        <VerificationBanner />

        {/* CF4-01 (bugfix 2.4). Documents sent, Stripe still checking: say so above the feed,
            because offers stay refused until the check completes. Réparateur mode only - this
            whole component is.

            CF4-09: suppressed while the journey is incomplete, because `RepairerJourneyCard`
            below is shown instead and already embeds this exact copy - showing both would be
            the duplicate block spec §4.7 rules out. Reappears once the journey is `complete`,
            which is also exactly when the card stops rendering. */}
        {identityPending && journeyComplete && <VerificationPendingBanner style={{ marginBottom: 18 }} />}

        {/* CF4-09, design spec §4.7: the réparateur setup resume card. Renders nothing itself
            while loading, for a client account, or once the journey is complete - see the
            component for the exact gates. */}
        {/* V8 E2: the spotlight wraps the card only while it shows, and the margin sits on the
            wrapper so the lit area stops at the card's edge. */}
        {journey !== null && !journeyComplete ? (
          <View {...journeyTarget} style={{ marginBottom: 18 }}>
            <RepairerJourneyCard />
          </View>
        ) : (
          <RepairerJourneyCard style={{ marginBottom: 18 }} />
        )}

        {/* The comma belongs to the name that follows it. With no name to show, « Bonjour, »
            dangles, so the salutation loses it rather than trailing off into nothing. */}
        <Text style={[styles.hello, { color: palette.muted }]}>
          {greetingName === null ? 'Bonjour' : 'Bonjour,'}
        </Text>
        {greetingName !== null && (
          <Text style={[styles.helloName, { color: palette.ink }]} numberOfLines={1}>
            {greetingName}
          </Text>
        )}

        {/* A button dressed as an input, as on the client's Accueil: there is no search ON
            this screen, and a real TextInput here would imply results below it. Opens the
            Recherche tab, which is the SEARCHABLE demande feed. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Rechercher une demande"
          onPress={() => router.push('/recherche')}
          style={[
            styles.searchBar,
            {
              backgroundColor: palette.mist,
              borderColor: palette.line,
              borderRadius: radii.field,
              marginTop: greetingName === null ? spacing.md : 14,
            },
          ]}
        >
          <IconSearch size={18} color={palette.faint} strokeWidth={2.2} />
          <Text style={[styles.searchText, { color: palette.faint }]}>
            Rechercher une demande…
          </Text>
        </Pressable>

        <View {...nearbyTarget}>
        <NearbyDemandeRow
          items={feed.data}
          isPending={feed.isPending}
          isError={feed.isError}
          located={located}
          now={now}
          onOpenDemande={(id) => router.push(`/demande/${id}`)}
          onSeeAll={() => router.push('/publier')}
        />
        </View>

        {/* Opens « Tableau de bord », as `AccueilPro.tsx:76` does. It opened « Mes
            propositions » until 2026-08-20, when the dashboard did not exist; that list is
            still reached from Profil, so nothing became unreachable - as the « Mes
            propositions » TILE since `CF-22` on 2026-08-30, where it was a MON ACTIVITÉ row
            before. That section no longer exists and the tile is the only route left. */}
        <RepairerActivityCard
          offersThisMonth={offersThisMonth}
          activeRepairs={active.length}
          rating={myProfile.data?.rating ?? null}
          isPending={offers.isPending || commandes.isPending}
          todoCount={todoCount}
          onPress={() => {
            markDashboardSeen.mutate();
            router.push('/tableau-de-bord');
          }}
        />

        <View style={{ marginTop: 14 }}>
          {/* `primary`, not a new « dark » variant: in réparateur mode `accent.accent` IS
              navy, so primary already renders the prototype's `.btn--dark`. Adding a
              variant would give the app two names for one appearance. */}
          <Button
            label="Voir les demandes"
            icon={<IconBriefcase size={18} color={palette.paper} strokeWidth={2.2} />}
            onPress={() => router.push('/publier')}
          />
        </View>

        {/* The whole section goes when there is nothing in it, rather than leaving a heading
            over blank space. That is the state EVERY account is in today: a commande needs
            `PAYMENTS_ENABLED`, which is absent on Render. `GET /commandes` is ungated and
            simply returns [], so this costs a request and renders nothing. */}
        {active.length > 0 && (
          <>
            <Text style={[styles.eyebrow, { color: palette.faint, marginTop: spacing.xl }]}>
              COMMANDES ACTIVES
            </Text>
            <View style={{ gap: spacing.md }}>
              {active.map((c) => (
                <Pressable key={c.id} onPress={() => router.push(`/commande/${c.id}`)}>
                  <Card>
                    <View style={styles.commandeRow}>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.commandeTitle, { color: palette.ink }]}
                          numberOfLines={2}
                        >
                          {c.demandeTitle}
                        </Text>
                        <Text style={[styles.commandeStep, { color: palette.red }]}>
                          {STEP_LABEL[c.step]}
                        </Text>
                      </View>
                      <Text style={[styles.commandePrice, { color: palette.ink }]}>
                        {euros(c.payoutCents)}
                      </Text>
                      <IconChevronRight size={18} color={palette.faint} strokeWidth={2.2} />
                    </View>
                  </Card>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <TipCard mode="REPAIRER" />
      </RevimeRefreshScrollView>
    </>
  );
}
