import { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../src/theme';
import { ScreenMotif } from '../../src/components/ScreenMotif';
import { Card } from '../../src/components/Card';
import { Field } from '../../src/components/Field';
import { Button } from '../../src/components/Button';
import { SettingsRow } from '../../src/components/SettingsRow';
import {
  IconChart,
  IconHeart,
  IconInbox,
  IconMailSend,
  IconMessage,
  IconSettings,
  IconUser,
  IconWrench,
} from '../../src/icons';
import { ProfileStats, type Stat } from '../../src/components/ProfileStats';
import { VerifiedChips } from '../../src/components/VerifiedChips';
import { ShortcutGrid, type Shortcut } from '../../src/components/ShortcutGrid';
import { useMyDemandes, useRepairer, useCommandes, useMyOffers, useMyParticularQuota } from '../../src/lib/queries';
import { useSessionContext } from '../../src/lib/session';
import { useTabBarSpace } from '../../src/lib/use-tab-bar-space';
import { signOutAndLeave } from '../../src/lib/sign-out';
import {
  useConnectStatus,
  useIdentityStatus,
} from '../../src/lib/queries';
import { useConnectOnboarding } from '../../src/lib/use-connect-onboarding';
import { ConnectOnboardingSheet } from '../../src/components/ConnectOnboardingSheet';
import {
  repairerVerificationState,
  repairerProfileCounts,
  mayVerifyBusiness,
} from '@revime/shared';
import { useIdentityStart } from '../../src/lib/use-identity-start';
import { VerificationPendingBanner } from '../../src/components/VerificationPendingBanner';
import { RepairerJourneyCard } from '../../src/components/RepairerJourneyCard';
import { SetupCompleteRow } from '../../src/components/SetupCompleteRow';
import { useRepairerJourney } from '../../src/lib/use-repairer-journey';
import { useTourPage, useTourTarget } from '../../src/tour/use-tour';
import { KeyboardAvoider } from '../../src/components/KeyboardAvoider';
import { ParticularQuotaCard } from '../../src/components/ParticularQuotaCard';
import { businessCardLine, quotaCardView } from '../../src/lib/particular-quota-view';

export default function Profil() {
  const router = useRouter();
  const { palette, accent, spacing } = useTheme();
  const { me, refresh, refreshIfStale } = useSessionContext();
  // `CF-22` removed the last reader of `me.username` on this screen - it was the `@username`
  // line under the deleted « PROFIL » row. The normalise-at-entry rule this used to demonstrate
  // still holds for every OTHER new DTO field here; see apps/mobile/AGENTS.md.
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();

  // Hero data. Both are cheap and both are ONLY what the hero can honestly show:
  // `useMyDemandes` gives the client's two counts, and the réparateur triple comes from the
  // public profile because `MeResponse` carries no rating, reviewCount or repairCount at all.
  // The repairer query is skipped entirely outside réparateur mode - `useRepairer` guards on
  // `Boolean(userId)`, so passing '' costs nothing.
  const myDemandes = useMyDemandes();
  const isRepairerMode = me?.profile.activeMode === 'REPAIRER' && me?.profile.repairerEnabled;
  const myRepairerProfile = useRepairer(isRepairerMode ? me.id : '');
  // CF4-10: « En cours » and « Propositions » need the same commande and offer lists Accueil
  // and the dashboard already fetch - `repairerProfileCounts` (packages/shared) derives both
  // from them rather than inventing a third count. Both queries are `enabled` only in
  // réparateur mode, so client mode fetches neither list.
  const myCommandes = useCommandes('repairer', Boolean(isRepairerMode));
  const myOffers = useMyOffers(Boolean(isRepairerMode));
  // V7 A10 (U7): the CGU art. 53 counter. Read in Réparateur mode only, where the card is drawn;
  // `quota` comes back null for a professional, so the card renders for private individuals alone.
  const myQuota = useMyParticularQuota(Boolean(isRepairerMode));
  const quotaView = quotaCardView(myQuota.data);

  const connectEnabled = me?.profile.repairerEnabled && me?.connectEnabled;
  const connectStatus = useConnectStatus(Boolean(connectEnabled));
  const connectOnboarding = useConnectOnboarding();
  const identityStatus = useIdentityStatus(Boolean(connectEnabled));

  // V8 E2: the shortcut grid sits below the fold for a repairer (`FND8-026`), so the page registers
  // its scroll view (DEC8-10 (2)); ready once the journey card's presence is known. Before the early
  // returns below: hooks run on every render.
  const { journey: tourJourney } = useRepairerJourney();
  const tour = useTourPage(
    'profil',
    me !== null && (me.profile.activeMode !== 'REPAIRER' || tourJourney !== null),
  );
  const gridTarget = useTourTarget('shortcutGrid');

  useFocusEffect(
    useCallback(() => {
      void refreshIfStale();
      // V7 A10: a payment to him changes the counter, and nothing on this device does that.
      if (isRepairerMode) void myQuota.refetch();
      // S3 dropped these two refetches without a word. They are what shows a status that changed
      // while the user was elsewhere (a webhook moved Connect to VERIFIED, an operator decided the
      // identity), and nothing else refetches them when this tab regains focus.
      if (connectEnabled) {
        void identityStatus.refetch();
        void connectStatus.refetch();
      }
    }, [refreshIfStale, connectEnabled, identityStatus.refetch, connectStatus.refetch, isRepairerMode, myQuota.refetch]),
  );
  // CF4-01: the start logic lives in one hook shared with « Statut de vérification », so both
  // surfaces keep the single mutation and its `loading` billing guard (see the hook's header).
  const {
    startIdentity: handleStartIdentity,
    loading: identityStartLoading,
    error: identiteError,
  } = useIdentityStart();
  // CF4-01: the four-state derivation shared with « Statut de vérification ». DTO fields read
  // through `?? null` once, here (apps/mobile/AGENTS.md).
  const identityStatusValue = identityStatus.data?.status ?? null;
  // CF4-39: REVIME's decision and its motif, normalised at entry (a stale API sends undefined).
  const identityDecision = identityStatus.data?.decision ?? null;
  const identityDecisionReason = identityStatus.data?.decisionReason ?? null;
  const verificationState = me
    ? repairerVerificationState(
        me.profile.verificationLevel,
        me.repairer?.kind ?? null,
        identityStatusValue,
        identityStatus.data?.lastErrorCode ?? null,
        identityDecision,
      ).state
    : null;

  /**
   * The escape hatch on the `!me` fallback below. Calls the shared sign-out function in
   * `src/lib/sign-out.ts`, which was extracted on 2026-08-30 to prevent a future fix from
   * landing in one duplicate and missing the other.
   */
  const handleForceSignOut = () =>
    void signOutAndLeave({
      queryClient,
      router,
    });

  // A session can exist while /users/me fails - an expired or unreadable cookie,
  // or the API being unreachable. Rendering null here left the user on a blank
  // screen with no way out. The `!me` escape hatch exists because the `/parametres`
  // hub is unreachable when this screen cannot render - that hub holds sign-out for
  // the loaded case. So the fallback keeps that one escape hatch available.
  if (!me) {
    return (
      <View style={[styles.screen, { backgroundColor: palette.paper, justifyContent: 'center', padding: spacing.lg }]}>
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_600SemiBold',
            fontSize: 16,
            color: palette.ink,
            textAlign: 'center',
            marginBottom: 8,
          }}
        >
          Profil indisponible
        </Text>
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_400Regular',
            fontSize: 13.5,
            color: palette.muted,
            textAlign: 'center',
            marginBottom: spacing.lg,
          }}
        >
          Impossible de charger votre compte. Vérifiez votre connexion, puis réessayez ou reconnectez-vous.
        </Text>
        <Button label="Réessayer" onPress={() => void refresh()} />
        <Pressable onPress={handleForceSignOut} style={{ paddingVertical: 16, alignItems: 'center' }}>
          <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.red }}>
            Se déconnecter
          </Text>
        </Pressable>
      </View>
    );
  }



  const handleConfigureVirements = () => {
    void connectOnboarding.startOnboarding();
  };



  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  const activeMode = me.profile.activeMode;

  /**
   * The hero stats. Two cells for a client, 3 + 2 for a réparateur (CF4-10) - see
   * `ProfileStats` for why that asymmetry is the honest shape rather than a layout
   * compromise.
   *
   * Note the different treatments of "no value": a null `rating` renders « - » because an
   * unrated réparateur is an ABSENCE, while a `repairCount` of 0 renders « 0 » because zero
   * repairs is a FACT (both `RepairerProfileDto`'s own). « En cours » and « Propositions »
   * follow the same rule for their OWN source queries: either renders « - », never « 0 »,
   * while its query (`myCommandes` / `myOffers`) is pending or has errored - a `0` there
   * would silently mean either "counted and none" or "not loaded yet", which is exactly the
   * ambiguity `AGENTS.md` bans for every new cell on this screen.
   */
  const repairerCounts = repairerProfileCounts(myCommandes.data ?? [], myOffers.data ?? []);
  const commandesUnavailable = myCommandes.isPending || myCommandes.isError;
  const offersUnavailable = myOffers.isPending || myOffers.isError;

  const clientStats: Stat[] = [
    { value: String(myDemandes.data?.length ?? 0), label: 'Demandes' },
    {
      value: String((myDemandes.data ?? []).filter((d) => d.status === 'IN_PROGRESS').length),
      label: 'En cours',
    },
  ];

  const repairerRows: Stat[][] = [
    [
      { value: String(myRepairerProfile.data?.repairCount ?? 0), label: 'Réparations' },
      {
        value: commandesUnavailable ? '-' : String(repairerCounts.activeCount),
        label: 'En cours',
      },
      {
        value: offersUnavailable ? '-' : String(repairerCounts.pendingOffersCount),
        label: 'Propositions',
      },
    ],
    [
      {
        value:
          myRepairerProfile.data?.rating == null
            ? '-'
            : myRepairerProfile.data.rating.toFixed(1),
        label: 'Note',
      },
      { value: String(myRepairerProfile.data?.reviewCount ?? 0), label: 'Avis' },
    ],
  ];

  /**
   * 🛑 `CF-22`: THE « Mon profil » TILE IS NOW THE ONLY ENTRY TO `/profil-public` IN EITHER MODE,
   * so it inherits the one thing the two deleted sections did that a fixed label cannot.
   *
   * « MON PROFIL PUBLIC » (réparateur) and « PROFIL » (client-only) both linked this same route,
   * which made the tile a DUPLICATE the moment `CF-11` added it - live in client mode for every
   * account since that slice, since every live account is a réparateur sitting in client mode.
   * Mockup `01` draws neither section. The réparateur one carried a data-dependent nudge, and
   * `AGENTS.md` prefers copy that SWITCHES ON DATA over copy that is fixed, so the nudge moved
   * into the sub rather than dying with the row.
   *
   * Measured against `ShortcutGrid`'s inner width, because that file's header requires it of any
   * label or sub added here: « Ajoutez une description » is **124.2pt** at 11.5pt regular against
   * 136pt on a 390pt screen and **128.8pt on a 375pt SE**, so it fits on ONE line even at the
   * narrowest - narrower than the « Informations personnelles » it replaces, which is 136.0pt and
   * already relies on `numberOfLines={2}`. Adding this string cannot overflow anything.
   *
   * `bio` is pre-existing rather than a new DTO field, and a TRUTHY test is what `AGENTS.md`'s
   * stale-API rule asks for: `''`, `null` and `undefined` all collapse to « needs a description ».
   */
  const profilSub =
    me.profile.repairerEnabled && !me.repairer?.bio
      ? 'Ajoutez une description'
      : 'Informations personnelles';

  /**
   * The RACCOURCIS tiles, and every one resolves to a real screen.
   *
   * 🛑 `CF-11`, 2026-08-30: THIS IS NOW MODE-AWARE, AND IT USED TO BE MODE-BLIND. One array
   * served both modes. ~~The RÉPARATEUR branch is deliberately UNCHANGED from the mode-blind
   * set, because his réparateur rubriques are `CF-22`'s.~~ **`CF-22` LANDED LATER THE SAME DAY
   * and both branches are now the client's own mockup `01`** - left panel for CLIENT, right
   * panel for RÉPARATEUR.
   *
   * The client tiles, in his order, from mockup `01`'s left panel:
   *
   *   Mes réparations | Messages
   *   Mes offres reçues | Mes favoris
   *   Mon profil | Paramètres
   *
   * The réparateur tiles, in his order, from mockup `01`'s right panel:
   *
   *   Tableau de bord | Mes propositions
   *   Mes réparations | Messages
   *   Mon profil | Paramètres
   *
   * Omissions are per `ShortcutGrid`'s standing convention - a tile that resolves, or no tile -
   * and each becomes one entry here the day its screen lands. `Mes favoris` landed with
   * `CF-18/19/20` on 2026-08-31 and is the client's FOURTH tile; the réparateur grid deliberately
   * has no Favoris tile and reaches that screen from the feed header instead. `Paramètres` landed
   * with `CF-47` on 2026-08-30 and is the SIXTH tile of BOTH grids, so `CF-47` closes two rows.
   * The owner confirmed omit-over-inert on 2026-08-30 for the client grid. So the client grid now
   * fills 2 + 2 + 2 and the réparateur grid 2 + 2 + 2.
   *
   * 🛑 `CF-22`: THE « NO DOUBLONS » HALF WAS ANSWERED BY HIS OWN DESIGN, NOT BY US.
   * Three of his six réparateur rubriques - Mes propositions, Tableau de bord, Mes réparations -
   * were link ROWS in a `MON ACTIVITÉ` section, and mockup `01`'s réparateur panel draws no such
   * section at all. So the tiles REPLACE the rows; that section is gone and only its Code postal
   * editor survives, under his own mockup-`04` heading « ZONE D'INTERVENTION ». Tiling the three
   * without deleting the rows is precisely how you CREATE the « écrans qui font doublon » he
   * reported - réparateur mode already had one instance of it (« Mes commandes » tile against the
   * « Mes réparations » row, same screen, same destination).
   *
   * « Mes demandes » is deliberately GONE from BOTH grids. It is not among his six in either
   * panel. On the client side `mes-demandes.tsx` is still reached from Accueil, which that
   * screen's own header comment records. 🛑 On the RÉPARATEUR side this tile was the only route
   * to it, so a réparateur now reaches his own demandes by switching to CLIENT mode - the
   * owner's explicit call on 2026-08-30, on the grounds that one's own repair requests are
   * client-mode content. Do not restore it without asking him.
   *
   * « Mes réparations » carries `paymentsEnabled` in BOTH grids, for the unchanged reason: with
   * payments off no commande can exist, so the tile would always open an empty list. The flag is
   * `true` on the live service, so it renders. Note the LABEL is his word in both modes now -
   * `commandes.tsx` used to title itself « Commandes » in réparateur mode while this tile said
   * « Mes réparations », so the tile and the screen it opened disagreed. `CF-22` fixed the
   * screen, which is the same mismatch `CF-11` fixed on the client side.
   */
  const clientShortcuts: Shortcut[] = [
    ...(me.paymentsEnabled
      ? [
          {
            label: 'Mes réparations',
            sub: 'En cours et terminées',
            icon: <IconWrench size={20} color={accent.accent} strokeWidth={2.2} />,
            onPress: () => router.push('/commandes'),
          },
        ]
      : []),
    {
      label: 'Messages',
      sub: 'Vos conversations',
      icon: <IconMessage size={20} color={accent.accent} strokeWidth={2.2} />,
      onPress: () => router.push('/(tabs)/messages'),
    },
    {
      label: 'Mes offres reçues',
      sub: 'Offres des réparateurs',
      icon: <IconInbox size={20} color={accent.accent} strokeWidth={2.2} />,
      onPress: () => router.push('/offres-recues'),
    },
    /**
     * `CF-18` / `CF-19` / `CF-20`, 2026-08-31. Mockup `01`'s fourth client tile.
     *
     * 🛑 **CORRECTED 2026-08-31 BY THE WHOLE-BRANCH REVIEW. THIS COMMENT USED TO SAY HIS OWN
     * SUB-LABEL « Réparateurs & annonces sauvegardées » DID NOT FIT, AND THE SUB WAS SHORTENED
     * TO « Réparateurs & annonces » ON THAT GROUND. The measurement was taken at the WRONG FONT
     * SIZE - 13.5pt, where `ShortcutGrid.tsx:138` sets the sub to `fontSize: 11.5`.** At 11.5pt
     * his wording fits the two lines `numberOfLines={2}` already provides, so it is restored:
     * the standing rule here is to deliver the client's ask and reshape the UI rather than drop
     * it, and there was nothing to reshape.
     *
     * Re-measured with PIL against the shipped `GoogleSansFlex_400Regular.ttf` at **11.5pt**,
     * against the **128.8pt** inner width of a 48%-basis tile on a 375pt iPhone SE (and 136.0pt
     * on a 390pt screen). The whole string is **202.5pt**, so it needs two lines - which it has.
     * React Native breaks GREEDILY at spaces, so both candidate breaks matter and both fit:
     *
     *   greedy   « Réparateurs & annonces »  126.8pt  +2.0pt on an SE, +9.2pt at 390
     *            « sauvegardées »             73.2pt  comfortable
     *   fallback « Réparateurs & »            73.5pt
     *            « annonces sauvegardées »   126.5pt  +2.3pt on an SE, +9.5pt at 390
     *
     * 🛑 **STATE THE MARGIN HONESTLY: on the narrowest device it is 2.0pt, or 1.6%, and PIL does
     * not model React Native's text shaper exactly.** If the shaper runs more than ~1.6% wider
     * than PIL the greedy break drops « annonces » to line 2, which still fits with 1.8% spare;
     * past ~1.8% line 2 truncates to « annonces sauvegar… ». There is ~7% headroom at 390pt, so
     * only the SE is at risk. **A device pass should confirm this does not truncate** - there is
     * no gate here that can see it. If it does, the answer is a different arrangement, not a
     * shorter string: « sauvegardées » is the only word the client wrote that we could drop, and
     * dropping it is what this correction reverses.
     *
     * Label « Mes favoris » is **79.8pt** at 14pt bold, the most comfortable in either grid.
     *
     * NOT in `repairerShortcuts`: mockup `01`'s réparateur panel has six tiles and none is
     * Favoris. That mode reaches `/favoris` from the feed header instead - design §3, Q1.
     */
    {
      label: 'Mes favoris',
      sub: 'Réparateurs & annonces sauvegardées',
      icon: <IconHeart size={20} color={accent.accent} strokeWidth={2.2} />,
      onPress: () => router.push('/favoris'),
    },
    {
      label: 'Mon profil',
      tourTarget: 'monProfilTile',
      sub: profilSub,
      icon: <IconUser size={20} color={accent.accent} strokeWidth={2.2} />,
      onPress: () => router.push('/profil-public'),
    },
    /**
     * `CF-47`, 2026-08-30. The sixth tile, and the last of the client's six rubriques per mockup `01`.
     * « Paramètres » is **80.8pt** at 14pt bold against **128.8pt** inner width on a 375pt SE - the most
     * comfortable label in either grid (the widest existing is « Mes offres reçues » at 122.5pt, ~6pt
     * tighter). The sub « Compte et sécurité » is **101.2pt** at 11.5pt regular, so it fits on one line
     * with ~28pt spare. Measured with PIL against GoogleSansFlex_700Bold.ttf / _400Regular.ttf.
     *
     * 🛑 **CORRECTED 2026-08-31: the sub used to be quoted as « 118.5pt at 13.5pt regular ». 13.5pt is
     * not the size `ShortcutGrid` renders a sub at - `ShortcutGrid.tsx:138` is `fontSize: 11.5` - and
     * 118.5pt is this string measured at that wrong size.** The CONCLUSION was unaffected: it fits on
     * one line at either size. The favoris tile above is where the same inherited error DID change an
     * outcome, and it cost the client his own wording for a day.
     */
    {
      label: 'Paramètres',
      sub: 'Compte et sécurité',
      icon: <IconSettings size={20} color={accent.accent} strokeWidth={2.2} />,
      onPress: () => router.push('/parametres'),
    },
  ];

  /**
   * Mockup `01`'s right panel, in his reading order. Every label measured against the 136pt
   * inner width (128.8pt on a 375pt SE) with PIL against the shipped `GoogleSansFlex_700Bold`,
   * per `ShortcutGrid.tsx`'s header - the widest is « Mes propositions » at **119.2pt**, then
   * « Mes réparations » 112.8pt and « Tableau de bord » 111.0pt. All five clear the SE with
   * ~9.6pt to spare, so the existing full-width-label tile takes this set unchanged.
   *
   * 🛑 AND THAT MEASUREMENT ALSO RE-CONFIRMS WHY THE TILE IS NOT SHAPED THE WAY HE DREW IT.
   * Icon-beside-label leaves the label ~62pt; the SHORTEST label here, « Messages », is 69.2pt.
   * So the mockup's horizontal arrangement fails for the réparateur set too, and not merely for
   * `CF-11`'s longer client labels. Do not re-litigate it - `ShortcutGrid.tsx` has the numbers.
   */
  const repairerShortcuts: Shortcut[] = [
    {
      label: 'Tableau de bord',
      sub: 'Activité & revenus',
      icon: <IconChart size={20} color={accent.accent} strokeWidth={2.2} />,
      onPress: () => router.push('/tableau-de-bord'),
    },
    {
      label: 'Mes propositions',
      sub: 'Offres envoyées',
      icon: <IconMailSend size={20} color={accent.accent} strokeWidth={2.2} />,
      onPress: () => router.push('/mes-propositions'),
    },
    ...(me.paymentsEnabled
      ? [
          {
            label: 'Mes réparations',
            sub: 'En cours et terminées',
            icon: <IconWrench size={20} color={accent.accent} strokeWidth={2.2} />,
            onPress: () => router.push('/commandes'),
          },
        ]
      : []),
    {
      label: 'Messages',
      sub: 'Vos conversations',
      icon: <IconMessage size={20} color={accent.accent} strokeWidth={2.2} />,
      onPress: () => router.push('/(tabs)/messages'),
    },
    {
      label: 'Mon profil',
      tourTarget: 'monProfilTile',
      sub: profilSub,
      icon: <IconUser size={20} color={accent.accent} strokeWidth={2.2} />,
      onPress: () => router.push('/profil-public'),
    },
    /**
     * `CF-47`, 2026-08-30. The sixth tile, and the last of the réparateur's six rubriques per mockup `01`.
     * Same measurements as the client tile: « Paramètres » **80.8pt** at 14pt bold / « Compte et sécurité »
     * **101.2pt** at 11.5pt regular, both fitting comfortably in the 128.8pt SE inner width.
     *
     * 🛑 **CORRECTED 2026-08-31 with the client tile's copy of this figure: the sub was quoted at 13.5pt,
     * which is not the size `ShortcutGrid.tsx:138` renders it at.** See that comment for why the same
     * error mattered on the favoris tile and not here.
     */
    {
      label: 'Paramètres',
      sub: 'Compte et sécurité',
      icon: <IconSettings size={20} color={accent.accent} strokeWidth={2.2} />,
      onPress: () => router.push('/parametres'),
    },
  ];

  // `activeMode`, NOT `repairerEnabled`: this is « what is he looking at right now », which
  // `AGENTS.md` records as a different question from « does he hold this capability ». Every
  // live réparateur account sits in CLIENT mode, so a `repairerEnabled` test here would show
  // them the réparateur grid while the rest of the screen showed client mode.
  const shortcuts = activeMode === 'CLIENT' ? clientShortcuts : repairerShortcuts;

  /**
   * 🛑 `CF-23` PRECEDENCE, AND THIS IS THE ONLY PLACE IN THE APP WHERE BOTH FIELDS EXIST.
   *
   * `avatarUrl` is the photo the user CHOSE. `me.image` is whatever an OAuth provider supplied at
   * sign-in - a `lh3.googleusercontent.com` URL, and one live account has one - which nothing in
   * this app has ever been able to change. A user who uploads a photo must see the photo they
   * uploaded, so the uploaded one wins.
   *
   * Both are typed `string | null` on the same object, so nothing but this line stops the wrong one
   * rendering. Derived ONCE here rather than branched at the two call sites below, which is
   * `AGENTS.md`'s rule for a new response field: give absence a single representation and make it
   * `null`. `||` rather than `??` on the second step so an empty string falls through too.
   */
  const avatarUri: string | null = (me.avatarUrl ?? null) || (me.image ?? null) || null;

  return (
    <View style={[styles.screen, { backgroundColor: palette.paper }]}>
      <ScreenMotif v={3} variant={activeMode === 'REPAIRER' ? 'navy' : 'accent'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: palette.paper, borderBottomColor: palette.line, paddingTop: 16 + insets.top }]}>
        <Text style={[styles.headerTitle, { color: palette.ink }]}>Profil</Text>
      </View>

      {/* Wraps only the ScrollView, so the Profil header stays pinned. The postal
          code editor sits far down this screen, so without this the keyboard
          covers the input the user is typing into. */}
      <KeyboardAvoider style={styles.avoid}>
      <ScrollView
        {...tour.scrollProps}
        style={styles.scrollView}
        contentContainerStyle={[styles.container, { paddingBottom: tabBarSpace }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Identity header */}
        <View
          style={[
            styles.identityBand,
            {
              backgroundColor: accent.accent,
              // MUST be the NEGATIVE of the ScrollView's own horizontal padding, or the band
              // does not reach the screen edges. It was `-spacing.lg` (16) against a
              // container padding of 20, which left a 4pt white strip down each side -
              // reported from a device on 2026-08-20. Both now read one constant so they
              // cannot drift apart again.
              marginHorizontal: -CONTENT_PADDING_H,
              paddingHorizontal: CONTENT_PADDING_H,
            },
          ]}
        >
          <View style={styles.identityRow}>
            {avatarUri ? (
              <Image
                source={{ uri: avatarUri }}
                style={[
                  styles.avatar,
                  styles.avatarImage,
                  {
                    borderColor: `${palette.paper}80`,
                  },
                ]}
                // The initials branch below is a `Text` that announced itself for free; an
                // unlabelled Image is skipped or read as a filename. See `AGENTS.md`.
                accessible
                accessibilityRole="image"
                accessibilityLabel="Votre photo de profil"
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: accent.accentSoft, borderColor: `${palette.paper}80` }]}>
                <Text style={[styles.avatarInitials, { color: accent.accent }]}>{getInitials(me.name)}</Text>
              </View>
            )}
            <View style={styles.identityText}>
              <Text style={[styles.identityName, { color: palette.paper }]}>{me.name}</Text>
              <Text style={[styles.identityEmail, { color: `${palette.paper}E6` }]}>{me.email}</Text>
              {/* `.profile-role` - which mode you are currently in, not a role you hold. The
                  prototype also puts a star rating and « Membre depuis 2024 » on this line;
                  neither is rendered, because a client has no rating in this product and
                  `MeResponse` carries no createdAt to derive a join date from. Inventing
                  either is the one thing this hero must not do. */}
              <View style={styles.rolePill}>
                <Text style={styles.rolePillLabel}>
                  {activeMode === 'REPAIRER' ? 'Réparateur' : 'Client'}
                </Text>
              </View>
            </View>
          </View>

          {isRepairerMode ? (
            <ProfileStats rows={repairerRows} />
          ) : (
            <ProfileStats stats={clientStats} />
          )}
        </View>

        <VerifiedChips me={me} />

        {/* CF4-09, design spec §4.7: the réparateur setup resume card, above the first
            réparateur-mode section on this screen. Renders nothing itself while loading, for a
            client account, or once the journey is complete - see the component for the exact
            gates. MON IDENTITÉ below is unchanged. */}
        <RepairerJourneyCard style={{ marginBottom: spacing.md }} />
        {/* V8 E1, mockup 6: takes the card's place once setup is complete (the card then renders nothing). */}
        <SetupCompleteRow style={{ marginBottom: spacing.md }} />

        {/* Gate card. Derived from MeResponse, not from any transient error state.
            This is the condition the card actually means: he is not yet a réparateur,
            the identity gate would refuse him, and there is somewhere to send him. It
            needs no failed request to have happened first.

            🛑 IT NOW ASKS THE ACCOUNT AS WELL AS THE FLAG, 2026-09-04 (`CF-55`). The three
            conditions above are all about the WORLD - `identityRequired` is literally
            `process.env.IDENTITY_GATE_ENABLED === 'true'` (`users.service.ts`) and carries no
            account data at all - so this card used to head itself « Vérification d'identité
            requise » at a user who was ALREADY verified, which is a false claim about him, the
            class `apps/mobile/AGENTS.md` bans. And its CTA pointed at `POST /identity/session`,
            which `identity.service.ts` refuses with 422 « Votre identité est déjà vérifiée. »
            for that user - while the control he actually needs, the mode switch, is on another
            screen entirely. Recorded live in the identity spec §9 item 5 and left for a copy
            decision; the owner took it on 2026-09-04.

            `hasSufficientIdentity` is the ACCOUNT half - IDENTITY or BUSINESS, the same floor
            `assertIdentityVerified` returns early on - so the two branches below are « he still
            has to verify » and « he is verified and simply has not switched the mode on ». That
            second state is not a corner case: it is what this whole flow produces, and it is
            also where a réparateur lands when Stripe finishes while the app is closed and he
            never sees `identite/retour.tsx`'s « Félicitations ! » at all (spec §5.6).

            MEASURED, cardHeading's own 16pt/600 Google Sans Flex in 303.0pt (375 - 20*2 screen
            - 16*2 Card padding; Card sets no borderWidth): « Identité vérifiée » 128.0pt, 57.8%
            margin, against the existing heading's 242.0pt. The CTA « Activer le mode
            réparateur » is 207.0pt of 263.0 (Button takes 20pt each side), 21.3% margin.
            🛑 `cardBody` sets NO fontFamily, so it renders in the SYSTEM font and is NOT
            measured against the shipped TTF - that would be a width in a typeface this style
            does not use. Its new string is 54 characters against the 79 the same style already
            renders below, so it cannot wrap further than what already ships. */}
        {/* Réparateur location. Gated on activeMode === 'REPAIRER' per CF3-03:
            the client profile must not display zone d'intervention. */}
        {activeMode === 'REPAIRER' && me.profile.repairerEnabled && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: palette.muted }]}>
              ZONE D'INTERVENTION
            </Text>
            <Card style={{ padding: 0 }}>
              {/* `CF-51`. WAS an inline editor; now pushes the one real editor. Deleting this row
                  was not an option - `DemandeFeed.tsx` sends a réparateur with no postal code
                  here - and keeping the editor meant two editors for one field.
                  🛑 THE GATE ABOVE STAYS `repairerEnabled` AND MUST NOT BECOME `activeMode`:
                  every live réparateur account sits in CLIENT mode. */}
              <SettingsRow
                label="Code postal"
                value={
                  me.repairer?.postalCode
                    ? [me.repairer.postalCode, me.repairer.serviceAreaLabel]
                        .filter(Boolean)
                        .join(' · ')
                    : 'Non renseigné'
                }
                onPress={() => router.push('/profil-public/zone')}
                last
              />
            </Card>
            <Text style={[styles.modeHint, { color: palette.muted }]}>
              Sert à calculer la distance affichée au client et à classer les demandes les plus
              proches en premier.
            </Text>
          </View>
        )}

        {/* RACCOURCIS - the client's six rubriques per mode, from mockup `01`. See the
            `clientShortcuts` / `repairerShortcuts` header above for the tile-by-tile reasoning.
            Not gated as a whole: every tile but « Mes réparations » works with payments off.

            🛑 `CF-22`, 2026-08-30: TWO SECTIONS THAT USED TO SIT DIRECTLY ABOVE THIS ARE GONE,
            and both were duplicates of this grid's « Mon profil » tile rather than surfaces of
            their own. « MON PROFIL PUBLIC » (`repairerEnabled`) and « PROFIL » (`!repairerEnabled`)
            each held exactly one row, and both pushed `/profil-public` - the same route the tile
            pushes. `CF-11` created the collision the moment it added that tile, and it has been
            LIVE IN CLIENT MODE ever since, for every account, because every live account is a
            réparateur sitting in client mode. Mockup `01` draws neither section in either panel.

            Neither deletion loses an affordance, and both were checked rather than assumed:

            - the réparateur row's data-dependent sub - « Ajoutez une description » when the bio
              is empty - moved into the tile's `sub` as `profilSub`. `AGENTS.md` asks for copy
              that switches on data over copy that is fixed, so this is the rule, not a workaround.
            - the client-only row displayed `@username` beneath its label. That is now dropped
              rather than relocated: mockup `01`'s client panel shows « Mon profil / Informations
              personnelles » and no username line, the header card already carries the name and
              email, and `/profil-public` - one tap away, unconditionally - is where the username
              is actually edited. It is a glance that goes, not a route. */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: palette.muted }]}>RACCOURCIS</Text>
          <View {...gridTarget}>
            <ShortcutGrid shortcuts={shortcuts} />
          </View>
        </View>

        {/* Identity verification section.

            🛑 EVERY IDENTITY `Button` IN THIS CARD PASSES `loading`, ADDED 2026-09-02, AND IT IS A
            BILLING GUARD RATHER THAN POLISH. The four primary CTAs below - Réessayer, Reprendre,
            Recommencer, Vérifier - passed none, while `DocumentOnlyOption` beside them does. They
            SHARE ONE MUTATION (`startIdentitySession`), so the guard was one-directional: while a
            document-only request was in flight the primary CTA stayed tappable, because `Button`
            only sets `disabled` on its `Pressable` when `loading` or `disabled` is passed. A tap
            then fired `start()` again with the OTHER variant, which takes the variant-change branch,
            cancels nothing useful and mints a second BILLED session while orphaning the first.
            `retour.tsx` now carries the same prop on « Réessayer » as of this change; its
            « Commencer » is a different mutation (Connect onboarding, not Identity). */}
        {activeMode === 'REPAIRER' && connectEnabled && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: palette.muted }]}>MON IDENTITÉ</Text>
            <Card>
              {/* CF4-39: REVIME's refusal or documents request comes FIRST - the refused session
                  still reads VERIFIED, and without this branch the card would say « Identité
                  vérifiée » to a réparateur REVIME just refused. Restart is allowed (spec §4.3). */}
              {identityDecision !== null ? (
                <>
                  <Text style={[styles.cardLine, { color: palette.muted }]}>
                    {identityDecision === 'DOCUMENTS_REQUESTED'
                      ? 'REVIME vous demande de nouveaux documents.'
                      : 'REVIME a refusé votre vérification.'}
                  </Text>
                  {identityDecisionReason && (
                    <Text style={[styles.cardLine, { color: palette.muted }]}>
                      Motif : {identityDecisionReason}
                    </Text>
                  )}
                  {identiteError && (
                    <Text style={[styles.cardError, { color: accent.accentDeep }]}>
                      {identiteError}
                    </Text>
                  )}
                  <Button
                    label="Recommencer"
                    onPress={handleStartIdentity}
                    loading={identityStartLoading}
                  />
                </>
              ) : identityStatus.data?.status === 'VERIFIED' ? (
                <>
                  <Text style={[styles.cardLine, { color: palette.muted }]}>
                    Identité vérifiée.
                  </Text>
                </>
              ) : identityStatus.data?.status === 'PROCESSING' ? (
                <>
                  {/* CF4-01 (bugfix 2.4): the client's « Vérification en cours » banner replaces
                      the bare line. Gated on the shared derivation's PENDING, which is this
                      branch unless the level already meets the floor (then it is VERIFIED). */}
                  {verificationState === 'PENDING' ? (
                    <VerificationPendingBanner />
                  ) : (
                    <Text style={[styles.cardLine, { color: palette.muted }]}>
                      Identité vérifiée.
                    </Text>
                  )}
                </>
              ) : identityStatus.data?.status === 'REQUIRES_INPUT' &&
                identityStatus.data.lastErrorCode ? (
                <>
                  <Text style={[styles.cardLine, { color: palette.muted }]}>
                    La vérification a échoué. Vous pouvez réessayer.
                  </Text>
                  {identiteError && (
                    <Text style={[styles.cardError, { color: accent.accentDeep }]}>
                      {identiteError}
                    </Text>
                  )}
                  <Button
                    label="Réessayer"
                    onPress={handleStartIdentity}
                    loading={identityStartLoading}
                  />
                </>
              ) : identityStatus.data?.status === 'REQUIRES_INPUT' ? (
                <>
                  <Text style={[styles.cardLine, { color: palette.muted }]}>
                    Vérification à terminer.
                  </Text>
                  {identiteError && (
                    <Text style={[styles.cardError, { color: accent.accentDeep }]}>
                      {identiteError}
                    </Text>
                  )}
                  <Button
                    label="Reprendre"
                    onPress={handleStartIdentity}
                    loading={identityStartLoading}
                  />
                </>
              ) : identityStatus.data?.status === 'CANCELED' ? (
                <>
                  <Text style={[styles.cardLine, { color: palette.muted }]}>
                    Vérification annulée.
                  </Text>
                  {identiteError && (
                    <Text style={[styles.cardError, { color: accent.accentDeep }]}>
                      {identiteError}
                    </Text>
                  )}
                  <Button
                    label="Recommencer"
                    onPress={handleStartIdentity}
                    loading={identityStartLoading}
                  />
                </>
              ) : (
                <>
                  <Text style={[styles.cardLine, { color: palette.muted }]}>
                    Vérifiez votre identité pour proposer vos services.
                  </Text>
                  {identiteError && (
                    <Text style={[styles.cardError, { color: accent.accentDeep }]}>
                      {identiteError}
                    </Text>
                  )}
                  <Button
                    label="Vérifier"
                    onPress={handleStartIdentity}
                    loading={identityStartLoading}
                  />
                </>
              )}
            </Card>
          </View>
        )}

        {/* V7 A10 (U7, `DEC7-22` Q4): the private individual's CGU art. 53 counter. `quotaView` is
            null for a professional and before the counter loads, so nothing renders for them. */}
        {activeMode === 'REPAIRER' && quotaView && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: palette.muted }]}>PLAFOND PARTICULIER</Text>
            <ParticularQuotaCard view={quotaView} onOpenBusiness={() => router.push('/entreprise')} />
          </View>
        )}

        {/* Level 3, and the condition is the whole point: it renders only for a
            réparateur who is ALREADY identity-verified. No banner, no gate card, no
            nudge and nothing at BASIC - « il ne doit absolument pas être obligatoire »,
            so the interface must never ask for it. */}
        {activeMode === 'REPAIRER' &&
          me.profile.repairerEnabled &&
          mayVerifyBusiness(me, identityStatusValue, identityDecision) && (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: palette.muted }]}>MON ENTREPRISE</Text>
              <Card>
                {me.profile.verificationLevel === 'BUSINESS' ? (
                  <Text style={[styles.cardLine, { color: palette.muted }]}>
                    Entreprise vérifiée. Le badge « Professionnel vérifié » s'affiche sur vos
                    offres.
                  </Text>
                ) : (
                  // V7 A10 Q8: « Requis » at the CGU art. 53 cap, « Facultatif » otherwise.
                  <Text style={[styles.cardLine, { color: palette.muted }]}>
                    {businessCardLine(myQuota.data)}
                  </Text>
                )}
                <Button
                  label={me.profile.verificationLevel === 'BUSINESS' ? 'Voir' : 'Vérifier'}
                  onPress={() => router.push('/entreprise')}
                />
              </Card>
            </View>
          )}

        {/* Payouts section */}
        {activeMode === 'REPAIRER' && connectEnabled && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: palette.muted }]}>MES VIREMENTS</Text>
            <Card>
              {connectStatus.data?.status === 'VERIFIED' ? (
                <>
                  <Text style={[styles.cardLine, { color: palette.muted }]}>
                    Virements activés.
                  </Text>
                </>
              ) : connectStatus.data?.status === 'REJECTED' ? (
                <>
                  <Text style={[styles.cardLine, { color: palette.muted }]}>
                    Votre compte de virement a été refusé. Contactez-nous.
                  </Text>
                </>
              ) : connectStatus.data?.status === 'RESTRICTED' ? (
                <>
                  <Text style={[styles.cardLine, { color: palette.muted }]}>
                    Informations complémentaires requises.
                  </Text>
                  {connectOnboarding.error && (
                    <Text style={[styles.cardError, { color: accent.accentDeep }]}>
                      {connectOnboarding.error}
                    </Text>
                  )}
                  <Button
                    label="Compléter"
                    onPress={handleConfigureVirements}
                    loading={connectOnboarding.loading}
                  />
                </>
              ) : connectStatus.data?.status === 'PENDING' ? (
                <>
                  <Text style={[styles.cardLine, { color: palette.muted }]}>
                    Vérification en cours.
                  </Text>
                  {connectOnboarding.error && (
                    <Text style={[styles.cardError, { color: accent.accentDeep }]}>
                      {connectOnboarding.error}
                    </Text>
                  )}
                  <Button
                    label="Reprendre"
                    onPress={handleConfigureVirements}
                    loading={connectOnboarding.loading}
                  />
                </>
              ) : (
                <>
                  <Text style={[styles.cardLine, { color: palette.muted }]}>
                    Configurez vos virements pour recevoir vos paiements.
                  </Text>
                  {connectOnboarding.error && (
                    <Text style={[styles.cardError, { color: accent.accentDeep }]}>
                      {connectOnboarding.error}
                    </Text>
                  )}
                  <Button
                    label="Configurer"
                    onPress={handleConfigureVirements}
                    loading={connectOnboarding.loading}
                  />
                </>
              )}
            </Card>
          </View>
        )}

        {/* Account section */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: palette.muted }]}>MON COMPTE</Text>
          <Card style={{ padding: 0 }}>
            <View style={[styles.accountRow, { borderBottomWidth: 0 }]}>
              <Text style={[styles.accountLabel, { color: palette.muted }]}>Email</Text>
              <Text style={[styles.accountValue, { color: palette.ink }]}>{me.email}</Text>
            </View>
          </Card>
        </View>
      </ScrollView>
      </KeyboardAvoider>
      <ConnectOnboardingSheet
        visible={connectOnboarding.visible}
        connectInstance={connectOnboarding.connectInstance}
        isTimedOut={connectOnboarding.isTimedOut}
        onExit={connectOnboarding.handleExit}
        onLoadError={connectOnboarding.handleLoadError}
        onRetry={connectOnboarding.handleRetry}
        onDismiss={connectOnboarding.handleDismiss}
        onPageDidLoad={connectOnboarding.handlePageDidLoad}
      />
    </View>
  );
}

/**
 * The ScrollView's horizontal padding, and the figure the identity band must cancel with a
 * negative margin to bleed to the screen edges. One constant because they are two halves of
 * one measurement - see `container` and the band's `marginHorizontal`.
 */
const CONTENT_PADDING_H = 20;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingBottom: 16,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  headerTitle: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 19,
    textAlign: 'center',
  },
  avoid: {
    flex: 1,
    zIndex: 1,
  },
  scrollView: {
    flex: 1,
    zIndex: 1,
  },
  container: {
    paddingHorizontal: CONTENT_PADDING_H,
    paddingTop: 0,
  },
  identityBand: {
    paddingTop: 30,
    // 30, not 22: the prototype's `.profile-band--tall` overrides `padding-bottom` to 30
    // precisely because this variant carries the stats panel, and 22 left the panel almost
    // touching the band's rounded bottom edge.
    paddingBottom: 30,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    borderCurve: 'continuous',
    marginBottom: 18,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 56,
    height: 56,
  },
  avatarInitials: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 20,
  },
  identityText: {
    flex: 1,
  },
  identityName: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 22,
  },
  // `.profile-role`: white 18% fill, 11/700, pill, 6pt above. `alignSelf: 'flex-start'` is
  // what keeps it hugging its label - without it the pill stretches the full band width.
  rolePill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  rolePillLabel: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 11, color: '#ffffff' },
  identityEmail: {
    fontSize: 13,
    marginTop: 2,
  },
  section: {
    marginBottom: 22,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  modeHint: {
    fontSize: 12,
    lineHeight: 17.4,
    marginTop: 10,
  },
  /**
   * A row in an account Card. Deliberately COLUMN (React Native's default), because two of
   * its four users stack a label above a value - « Code postal » above its editor, « Email »
   * above the address. Do not add `flexDirection: 'row'` here: it would collapse both of
   * those onto one line.
   */
  accountRow: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  postalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accountLabel: {
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    marginBottom: 6,
  },
  accountValue: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  cardHeading: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 16,
    marginBottom: 8,
  },
  cardBody: {
    fontSize: 13.5,
    lineHeight: 19.5,
    marginBottom: 16,
  },
  cardLine: {
    fontSize: 13.5,
    lineHeight: 19.5,
    marginBottom: 16,
  },
  cardError: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
});
