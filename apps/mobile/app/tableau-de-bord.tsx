import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { RevimeRefreshScrollView } from '../src/components/RevimeRefreshScrollView';
import {
  activityCells,
  euros,
  repairerActivity,
  revenueSubline,
  type DashboardTodoItem,
} from '@revime/shared';
import { useTheme } from '../src/theme';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Card } from '../src/components/Card';
import { RatingBreakdown } from '../src/components/RatingBreakdown';
import { TodoSection } from '../src/components/TodoSection';
import { ActivityList } from '../src/components/ActivityList';
import { QuoteRequestList } from '../src/components/QuoteRequestList';
import {
  useCommandes,
  useRepairer,
  useRepairerDashboard,
  useMarkDashboardSeen,
  useRepairerQuoteRequests,
  useRepairerReviews,
} from '../src/lib/queries';
import { useSessionContext } from '../src/lib/session';
import { useTourPage, useTourTarget } from '../src/tour/use-tour';

/**
 * « Tableau de bord » - the réparateur's own activity, transcribed from
 * `repareme-web/src/screens/TableauDeBord.tsx`.
 *
 * Reached from the Accueil activity card and from Profil, which is both of the prototype's own
 * entry points (`AccueilPro.tsx:76` and `Profil.tsx:47`). Until this screen existed the card
 * opened « Mes propositions » instead, because that was the only réparateur summary surface
 * built; that screen keeps its own Profil entry and is not orphaned.
 *
 * 🛑 **Both entry points are RÉPARATEUR-MODE ONLY as of 2026-08-25, and that is `CF-12`** -
 * the client wrote « Pas de tableau de bord côté client ». The Accueil card always was, by
 * sitting inside `index.tsx`'s `activeMode === 'REPAIRER'` early return; the Profil entry was
 * NOT, because the section holding it was gated on `repairerEnabled`, so a dual-mode account
 * in client mode could reach this screen from it.
 *
 * 🛑 **HOW PROFIL REACHES THIS CHANGED ON 2026-08-30 (`CF-22`) AND THE MODE ANSWER DID NOT.**
 * It was a row in a `MON ACTIVITÉ` section, carrying its own `activeMode` check to escape that
 * section's `repairerEnabled` gate. It is now the « Tableau de bord » TILE in Profil's
 * RACCOURCIS grid, and the whole grid is chosen by `activeMode`, so the per-row check is gone
 * because the container finally asks the right question. `MON ACTIVITÉ` no longer exists -
 * only its Code postal editor survives, under the heading « ZONE D'INTERVENTION ».
 *
 * The `repairerEnabled` guard below is deliberately NOT narrowed to `activeMode` to match.
 * It is the deep-link fallback, and a mode is a view preference rather than a permission: a
 * réparateur who lands here by link while in client mode should see their dashboard, not an
 * « activez le mode réparateur » message about a mode they already have.
 *
 * 🛑 **Every figure here is 0 or « - » for every account in production, and that is the
 * state it is designed for.** A commande needs `PAYMENTS_ENABLED`, absent on Render, and
 * there are no reviews. So the revenue hero explains its own zero rather than presenting it
 * bare - the owner's call on 2026-08-20, taken with the alternative of hiding the block.
 * `revenueSubline` owns that copy and is tested over every state.
 *
 * ## Two of the prototype's four grid cells are NOT here
 *
 * « temps de réponse » and « missions / semaine » are gone, and their absence is
 * ESTABLISHED rather than an omission - see `activityCells`. Nothing records demande-to-offer
 * latency, and a weekly average needs a history that does not exist. Both are the shape
 * `AGENTS.md` names: prototype copy asserting a fact about the user, inherited from
 * `prodata.ts`. « avis reçus » and « en cours » replace them and are real.
 *
 * ## Where the numbers come from
 *
 * No new endpoint. Revenue, pending, « en cours » and « terminées » are derived from the
 * commande list this screen already fetches - `CommandeListItem` carries `payoutCents`,
 * `status` and `releasedAt`, which is why the dashboard cost no API work. Revenue months
 * (the big amount and its delta) are bucketed by `releasedAt` - when the transfer to this
 * réparateur succeeded - not by `createdAt`, since the money moving is what the figure
 * means to describe (CF4-11, D2). The hero's second row, « En attente » / « Versés », adds
 * `pendingCents` and `paidOutCents`: « Versés » is the all-time sum transferred to his
 * Stripe account, from our own data, with no month filter and no live Stripe read (D1).
 * The rating pair comes from the PUBLIC profile because `MeResponse` carries no rating,
 * reviewCount or repairCount at all, exactly as `profil.tsx:71` already does it, and the
 * server's `rating` is used rather than one averaged here so this screen and the public
 * profile cannot round differently.
 */
export default function TableauDeBord() {
  const { palette, radii, spacing } = useTheme();
  const router = useRouter();
  const { me } = useSessionContext();

  const repairerId = me?.profile.repairerEnabled ? me.id : '';
  const commandes = useCommandes('repairer');
  const myProfile = useRepairer(repairerId);
  const reviews = useRepairerReviews(repairerId);
  // CF4-22/23/26. Hook called before the early return below, as every hook here must be.
  const dashboard = useRepairerDashboard(Boolean(me?.profile.repairerEnabled));
  // CF4-25. Same rule: before the early return.
  const quoteRequests = useRepairerQuoteRequests(Boolean(me?.profile.repairerEnabled));
  // CF5-15: Stamp dashboard viewed to clear the home notification pill.
  const markDashboardSeen = useMarkDashboardSeen();
  // V8 E2: « Demandes de devis » sits below the fold on a small phone, so the page registers its
  // scroll view and the tour scrolls to it (DEC8-10 (2)). Before the early return: hooks run always.
  const tour = useTourPage(
    'tableau',
    !commandes.isPending && !myProfile.isPending && !dashboard.isPending && !quoteRequests.isPending,
  );
  const revenusTarget = useTourTarget('revenusHero');
  const devisTarget = useTourTarget('devisSection');

  useEffect(() => {
    // Only fire if unseen to-dos exist, avoiding redundant mutations when already optimistically stamped on card press
    if (me?.profile.repairerEnabled && (dashboard.data?.unseenTodoCount ?? 1) > 0) {
      markDashboardSeen.mutate();
    }
  }, [me?.profile.repairerEnabled, dashboard.data?.unseenTodoCount]);

  if (!me?.profile.repairerEnabled) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
        <ScreenHeader title="Tableau de bord" onBack={() => router.back()} />
        <View style={{ padding: spacing.lg }}>
          <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', fontSize: 14, color: palette.muted }}>
            Activez le mode réparateur pour suivre votre activité.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  /**
   * A single `now`, captured once per render, so the month boundary cannot move between the
   * revenue figure and the delta computed from it.
   */
  const activity = repairerActivity(commandes.data ?? [], new Date());

  // One flag for the whole screen, as the Accueil card does: a « 0 » that is really "not
  // loaded yet" is a wrong claim, and two independent queries feed these four cells.
  const isPending = commandes.isPending || myProfile.isPending;

  const cells = activityCells(
    activity,
    myProfile.data?.rating ?? null,
    myProfile.data?.reviewCount ?? 0,
  );

  const hasReviews = (reviews.data?.length ?? 0) > 0;

  // New DTO: read ONCE at entry through `??`, never raw (AGENTS.md - the app can be newer
  // than the API it talks to, and a stale server sends these fields `undefined`).
  const todoItems = dashboard.data ? (dashboard.data.todo ?? []) : null;
  const activityItems = dashboard.data?.activity ?? [];
  const now = new Date();

  const openTodo = (item: DashboardTodoItem) => {
    switch (item.kind) {
      case 'DISPUTE':
        // CF4-22: « Répondre → » goes straight to his confidential dispute space.
        if ((item.awaitingReply ?? 0) > 0 && item.commandeId) {
          router.push(`/commande/${item.commandeId}/litige`);
          return;
        }
        router.push(item.commandeId ? `/commande/${item.commandeId}` : '/commandes');
        return;
      case 'ATTENTION':
        router.push(item.commandeId ? `/commande/${item.commandeId}` : '/commandes');
        return;
      case 'MATCHING':
        router.push('/publier?matching=1');
        return;
      case 'CATEGORIES_MISSING':
        router.push('/mes-categories');
        return;
      case 'QUOTE_REQUESTS':
        router.push('/devis-recus');
        return;
    }
  };

  const openQuoteRequests = quoteRequests.data
    ? quoteRequests.data.filter((q) => q.status === 'OPEN').slice(0, 3)
    : undefined;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      {/* 🛑 NO `ScreenMotif` HERE, and it must not be added back. The owner removed it on
          2026-08-20 after seeing it on device: `COMPOSITIONS[5]` puts a pale blob at 40 %
          height on the left and a dotted arc bottom-right, and on this screen both land in
          the empty space under the grid, where they read as content rather than as
          background. The prototype does draw a motif here (`TableauDeBord.tsx:12`), so this
          is a deliberate divergence from it, decided by looking at the real thing.

          It is also the one screen where the motif has nothing to hide behind: every other
          surface that carries one fills its lower half with rows or cards. */}
      {/* onBack is REQUIRED, not polish: ScreenHeader renders an empty spacer without it and
          this is a pushed screen, so there would be no way back. */}
      <ScreenHeader title="Tableau de bord" subtitle="Votre activité" onBack={() => router.back()} />
      <RevimeRefreshScrollView
        {...tour.scrollProps}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        onRefresh={() =>
          Promise.allSettled([
            commandes.refetch(),
            myProfile.refetch(),
            reviews.refetch(),
            dashboard.refetch(),
            quoteRequests.refetch(),
          ])
        }
      >
        <View
          {...revenusTarget}
          style={[
            styles.hero,
            { backgroundColor: palette.navy, borderRadius: radii.card, borderCurve: 'continuous' },
          ]}
        >
          <Text style={styles.heroLabel}>Revenus (ce mois)</Text>
          <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {isPending || commandes.isError ? '-' : euros(activity.revenueThisMonthCents)}
          </Text>
          {/* The prototype's fixed « +18 % · 92 € en attente » is not transcribed as one
              line: the « en attente » half now has its own figure below, in the row, and
              the delta half is `revenueSubline`, which renders nothing rather than a false
              claim on an account with no month-over-month change yet. No TrendingUp glyph
              either, because in most states this line is not a rise at all. */}
          {(() => {
            const subline = commandes.isError
              ? 'Impossible de charger votre activité. Tirez vers le bas pour réessayer.'
              : isPending
                ? 'Chargement…'
                : revenueSubline(activity);
            return subline === null ? null : <Text style={styles.heroSub}>{subline}</Text>;
          })()}

          {/* CF4-11: « En attente » / « Versés », a second row inside the same navy hero
              rather than a new section - the design spec's D5. Both figures come from the
              commande list already fetched above; « - » is this screen's existing
              not-loaded-yet convention, shared with the grid cells below. */}
          <View style={styles.heroRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroLabel}>En attente</Text>
              <Text
                style={styles.heroSubAmount}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {isPending || commandes.isError ? '-' : euros(activity.pendingCents)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroLabel}>Versés</Text>
              <Text
                style={styles.heroSubAmount}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {isPending || commandes.isError ? '-' : euros(activity.paidOutCents)}
              </Text>
            </View>
          </View>

          {/* Caption only once « Versés » is a real, loaded, non-zero figure - otherwise it
              asserts a Stripe transfer that has not happened. */}
          {!isPending && !commandes.isError && activity.paidOutCents > 0 && (
            <Text style={[styles.heroSub, { marginTop: 10 }]}>
              Les fonds versés sont transférés sur votre compte bancaire par Stripe.
            </Text>
          )}
        </View>

        <View style={styles.grid}>
          {cells.map((c) => (
            <View
              key={c.label}
              style={[
                styles.cell,
                {
                  backgroundColor: palette.paper,
                  borderColor: palette.line,
                  borderRadius: radii.card,
                  borderCurve: 'continuous',
                },
              ]}
            >
              <Text style={[styles.cellNum, { color: palette.ink }]}>
                {isPending ? '-' : c.value}
              </Text>
              <Text style={[styles.cellLabel, { color: palette.muted }]}>{c.label}</Text>
            </View>
          ))}
        </View>

        {/* CF4-22 / CF4-23, in the client's order (spec G5): hero, stats, « À faire »,
            « Activité récente », then the rating breakdown. */}
        <TodoSection
          items={todoItems}
          isPending={dashboard.isPending}
          isError={dashboard.isError}
          onOpen={openTodo}
        />
        <ActivityList
          items={activityItems}
          now={now}
          onOpen={(id) => router.push(`/commande/${id}`)}
        />

        {/* CF4-25 (spec §4.3): « Demandes de devis », the OPEN private requests with their
            expiry. At most three here; « Tout voir » opens the whole inbox, closed ones too. */}
        <View {...devisTarget} style={styles.quoteHeader}>
          <Text style={[styles.eyebrow, { color: palette.faint, marginTop: 0, marginBottom: 0 }]}>DEMANDES DE DEVIS</Text>
          <Pressable onPress={() => router.push('/devis-recus')} accessibilityRole="button" hitSlop={8}>
            <Text style={[styles.quoteLink, { color: palette.ink2 }]}>Tout voir</Text>
          </Pressable>
        </View>
        <QuoteRequestList
          items={openQuoteRequests}
          isPending={quoteRequests.isPending}
          isError={quoteRequests.isError}
          onOpen={(id) => router.push(`/demande/${id}`)}
          emptyLabel="Aucune demande de devis en attente."
        />

        {/* Hidden entirely rather than rendered empty, which is what the public profile does
            with the same data and is the only honest option: with no reviews there is no
            distribution, and five empty tracks would read as five zero-star ratings. */}
        {hasReviews && reviews.data && (
          <>
            <Text style={[styles.eyebrow, { color: palette.faint }]}>RÉPARTITION DES NOTES</Text>
            <Card>
              <RatingBreakdown reviews={reviews.data} showCounts />
            </Card>
          </>
        )}
      </RevimeRefreshScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  /** `.dash-hero` - navy, 20pt padding (styles.css:1608). */
  hero: { padding: 20 },
  heroLabel: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12.5, color: 'rgba(255,255,255,0.72)' },
  /** `.font-display` at 34/800 in the prototype; Google Sans Flex tops out at 700 here. */
  heroAmount: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 34, color: '#ffffff', marginTop: 2 },
  heroSub: {
    fontFamily: 'GoogleSansFlex_500Medium',
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 6,
    lineHeight: 17,
  },
  /** CF4-11's « En attente » / « Versés » row - a hairline above two equal columns. */
  heroRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
    marginTop: 14,
    paddingTop: 12,
  },
  heroSubAmount: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 18, color: '#ffffff', marginTop: 2 },
  /** `.dash-grid` - two columns, 10pt gap (styles.css:1609). `flexBasis` under 50 % leaves
   *  room for the gap, so exactly two cells land per row at any width. */
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  /** `.dash-cell` (styles.css:1610). */
  cell: { flexGrow: 1, flexBasis: '47%', borderWidth: 1, padding: 14, alignItems: 'center' },
  cellNum: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 22 },
  cellLabel: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 11, marginTop: 2 },
  /** `.eyebrow` (styles.css:172). */
  eyebrow: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 11,
    letterSpacing: 1.6,
    marginTop: 22,
    marginBottom: 10,
  },
  /** CF4-25: the eyebrow with a trailing « Tout voir », so the margins move onto the row. */
  quoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 10,
  },
  quoteLink: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 12.5 },
});
