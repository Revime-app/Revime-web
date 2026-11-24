import { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ratingLabel,
  VERIFIED_BADGE_LABEL,
  DAY_LABELS_FR,
  formatDayHours,
  isDeletedUsername,
  type DayOfWeek,
} from '@revime/shared';
import { useTheme } from '../../src/theme';
import { Card } from '../../src/components/Card';
import { Badge } from '../../src/components/Badge';
import { Button } from '../../src/components/Button';
import { Initials } from '../../src/components/Initials';
import { RatingBreakdown } from '../../src/components/RatingBreakdown';
import { ScreenMotif } from '../../src/components/ScreenMotif';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { RevimeLoader } from '../../src/components/lottie/RevimeLoader';
import { FavoriteHeart } from '../../src/components/FavoriteHeart';
import {
  useRepairer,
  useRepairerReviews,
  useOpenConversation,
  useFavoriteRepairers,
  useToggleFavoriteRepairer,
  useMyDemandes,
} from '../../src/lib/queries';
import { useSessionContext } from '../../src/lib/session';
import { ApiError } from '../../src/lib/api';

/**
 * The cover strip's height, read by BOTH the clipping `View` and the banner `Image` inside it.
 *
 * ONE constant rather than two literals, for the reason `profil.tsx`'s `CONTENT_PADDING_H` exists:
 * two numbers that must agree and are written twice will eventually disagree, and here the symptom
 * would be a banner that either overflows its clip or leaves a strip of background under itself.
 * `AGENTS.md` requires both of an `Image`'s dimensions to be definite, so the height cannot simply
 * be inherited. `CF-24`.
 */
const COVER_H = 120;

/**
 * A réparateur's public profile - spec §7.3.
 *
 * Reached from FIVE places, and the sticky bar takes its shape from which route params
 * arrived (§4.2). That is what replaced making `Conversation.demandeId` nullable: the
 * prototype's bar conflated two entry contexts, and splitting them keeps piece 1's
 * « an offer is the price of contact » gate intact at ZERO DDL.
 *
 * | Arrived with          | Bar                                            |
 * |-----------------------|------------------------------------------------|
 * | demandeId + offerId   | « Contacter » + « Choisir cette offre »         |
 * | demandeId only        | « Contacter »                                  |
 * | neither               | « Demander un devis »                          |
 *
 * 🛑 When every button in a state is flag-suppressed, NO bar renders - not an empty
 * white one. In production today that means the offer-card path shows no bar, because
 * both flags are absent, and the directory path is the one that works.
 */
export default function RepairerProfileScreen() {
  // `accent` went with the histogram when it moved to `RatingBreakdown`, which owns the bar
  // colour now. It is not re-added here: two callers reading the accent for the same bars is
  // how the two copies came to exist in the first place.
  const { palette, spacing, type } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    userId: string;
    demandeId?: string;
    offerId?: string;
  }>();
  const userId = params.userId;
  const { demandeId, offerId } = params;

  const { me } = useSessionContext();
  const repairer = useRepairer(userId);
  const reviews = useRepairerReviews(userId);
  const openConversation = useOpenConversation();
  const favoriteRepairers = useFavoriteRepairers();
  const toggleFavoriteRepairer = useToggleFavoriteRepairer();
  const [error, setError] = useState<string | null>(null);

  const onContact = () => {
    if (openConversation.isPending || userId === me?.id) return;
    setError(null);
    openConversation.mutate(
      demandeId ? { demandeId, repairerUserId: userId } : { repairerUserId: userId },
      {
        onSuccess: ({ id }) => router.push(`/conversation/${id}`),
        // A button that silently does nothing reads as broken. Both the 422 and the
        // offer-gate refusal carry authored French. Same handling as offres.tsx.
        onError: (e) =>
          setError(
            e instanceof ApiError ? e.message : "La conversation n'a pas pu être ouverte.",
          ),
      },
    );
  };

  const myDemandes = useMyDemandes();
  const existingQuoteDemande = useMemo(() => {
    return (
      myDemandes.data?.find(
        (d) => d.status === 'OPEN' && d.quoteRequest?.repairer.userId === userId,
      ) ?? null
    );
  }, [myDemandes.data, userId]);

  const canContact = Boolean(me?.messagingEnabled) && userId !== me?.id;
  const canChoose = Boolean(demandeId) && Boolean(offerId) && Boolean(me?.paymentsEnabled) && userId !== me?.id;
  const canQuote = !demandeId && userId !== me?.id;
  const showBar = canContact || canChoose || canQuote;

  const data = repairer.data;
  // Normalize newly added fields once at entry so template literals and guards cannot
  // read undefined from an API that has not compiled the change. See apps/mobile/AGENTS.md.
  const username = data?.username ?? null;
  const specialities = data?.specialities ?? [];

  // `CF-51`: fold the radius into the zone line.
  const radiusKm = data?.serviceRadiusKm ?? null;
  const areaLabel = data?.serviceAreaLabel ?? null;
  const zoneLine =
    areaLabel === null && radiusKm === null
      ? null
      : [areaLabel, radiusKm === null ? null : `rayon de ${radiusKm} km`]
          .filter((p) => p !== null)
          .join(' · ');

  const isFavorited = favoriteRepairers.data?.some((r) => r.userId === userId) ?? false;
  /**
   * 🛑 `data !== undefined` IS PART OF THIS TEST ON PURPOSE, added 2026-08-31, and it is the same
   * shape `demande/[id]/index.tsx:119` already uses for its own heart. Two reasons, and the second
   * is a bug this closes:
   *
   * - the error line this screen shows on a failed toggle renders inside `{data && (…)}`, so a
   *   heart that is tappable BEFORE the profile resolves could fail silently - the exact « button
   *   that silently does nothing » this file's `onContact` comment warns about;
   * - the optimistic add below hands the cache a real `RepairerCardDto`, and `data` is where it
   *   comes from. `RepairerProfileDto` extends that type, so nothing is assembled by hand.
   */
  const canFavorite = data !== undefined && userId !== me?.id;

  const handleToggleFavorite = () => {
    setError(null);
    toggleFavoriteRepairer.mutate(
      // `data` is non-undefined here: the heart only renders when `canFavorite`, which requires it.
      { userId, next: !isFavorited, card: data },
      {
        // Same handling as `onContact` twenty lines up, and for the identical reason: a button
        // that silently does nothing reads as broken. The 422s the server can answer here carry
        // authored French - « Ce réparateur n'est pas disponible. », « Vous ne pouvez pas vous
        // ajouter en favori. » - and a 404 (the deployed API has no `/favorites` yet) does not,
        // which is what the fallback is for.
        onError: (e) =>
          setError(
            e instanceof ApiError ? e.message : "Ce favori n'a pas pu être enregistré.",
          ),
      },
    );
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      {/*
        🛑 A REAL TITLE, AND NOT `data?.displayName`. `title=""` was the only empty title among the
        19 `ScreenHeader` call sites, so this header centred nothing between the chevron and the
        heart and read as a bare bar. Every other caller passes a FIXED string naming the screen,
        which is also what `ScreenHeader`'s own `subtitle` doc asks for - « it labels the screen and
        must not carry a claim about the user or his data ».

        `displayName` was the other candidate and is worse for two measured reasons: it is already
        this screen's headline 40pt below, so the header would render it twice; and at 700Bold 19pt
        the longest seeded name, « Réparateur Test Long Nom », is **250.2pt** against the **263pt**
        this header leaves between its two 40pt slots on a 375pt SE - 12.8pt of margin, and no
        `numberOfLines`, so a longer real name WRAPS and grows the bar. « Profil du réparateur » is
        **185.2pt**, narrower than the « Détail de la demande » (195.8pt) that already ships.
      */}
      <ScreenHeader
        title="Profil du réparateur"
        onBack={() => router.back()}
        right={
          canFavorite ? <FavoriteHeart filled={isFavorited} onToggle={handleToggleFavorite} /> : undefined
        }
      />

      {repairer.isPending ? (
        <View style={styles.loaderContainer}>
          <RevimeLoader variant="fill" size={72} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: showBar ? 120 : spacing.xxl }}>
        {/*
          `CF-24`. The prototype's photographic cover now HAS a source - `RepairerProfile.bannerPath`
          - so this strip renders it when the réparateur has uploaded one and keeps the app's own
          motif when he has not.

          🛑 THIS COMMENT USED TO SAY « the photographic cover has no source: neither `cover` nor a
          gallery exists in the schema, and image upload is its own slice. » Every clause was true
          when written and the last one was a prediction that came true: this is that slice. Kept as
          the record of why the motif is the fallback rather than a grey placeholder - it was
          designed as the real treatment, not as a stand-in for a missing image.

          The FALLBACK, not a placeholder: `bannerUrl` is null for all 11 live réparateur profiles
          and for every one that never uploads, so the motif is the ordinary case and must stay a
          finished-looking design rather than an empty state.

          A TRUTHY check rather than `!== null`, per `AGENTS.md`: `bannerUrl` is a new DTO field and
          arrives `undefined` from an API older than the app, and truthy collapses absent, null and
          '' into the one shape that cannot render a broken image.

          🛑 **THIS STRIP IS THE SCROLLVIEW'S FIRST CHILD, AND IT HAS TO BE. Do not lift it above
          the `ScreenHeader` again.** `CF-18/19/20/27` moved it out of the scroll to make room for
          the header, and that silently broke the avatar: the wrapper below carries
          `marginTop: -56`, calibrated to pull a 44pt `Initials` up over the bottom of this 120pt
          cover. With the padded content `View` as the scroll's first child instead, y=0 is the
          content origin, so -56 put the avatar at [-44, 0] - above the scroll content, where it is
          clipped or painted over by the header bar. The overlap is what mockup `04` draws, and
          `f0bc605` (the merge base) had exactly this nesting.

          Keeping the header AND returning the cover here also fixes the chrome cost: ~120pt of
          banner plus ~72pt of header had become permanent, non-scrolling chrome - ~192pt of a
          667pt iPhone SE. Only the header is fixed now; the banner scrolls away with the content.
        */}
        <View style={{ height: COVER_H, overflow: 'hidden' }}>
          {data?.bannerUrl ? (
            <Image
              source={{ uri: data.bannerUrl }}
              // BOTH dimensions definite, never `aspectRatio` - `AGENTS.md` records that costing a
              // logo rendered at its full intrinsic size. `cover` because this is a USER
              // PHOTOGRAPH: the same file's rule is logos `contain`, photographs `cover`, and
              // `contain` here would letterbox a portrait photo inside a 3:1 strip.
              style={{ width: '100%', height: COVER_H }}
              resizeMode="cover"
              // An unlabelled Image is skipped or read as a filename. The motif branch is
              // decorative and correctly announces nothing; this one is content.
              accessible
              accessibilityRole="image"
              accessibilityLabel={`Bannière de ${data.displayName}`}
            />
          ) : (
            <ScreenMotif v={2} variant="accent" />
          )}
        </View>

        <View style={{ padding: spacing.lg, paddingTop: spacing.md }}>
          {repairer.isError && (
            <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', color: palette.red }}>
              {repairer.error instanceof ApiError && repairer.error.code === 'NOT_FOUND'
                ? 'Ce réparateur est introuvable.'
                : 'Impossible de charger ce profil. Tirez vers le bas pour réessayer.'}
            </Text>
          )}

          {data && (
            <>
              {/*
                🛑 `-56` IS CALIBRATED AGAINST THE COVER STRIP ABOVE, AND IS ONLY CORRECT WHILE
                THAT STRIP IS THIS SCROLLVIEW'S FIRST CHILD. The padded parent adds
                `paddingTop: spacing.md` (12), so -56 lands a 44pt `Initials` at
                [cover_bottom − 44, cover_bottom] - the bottom third of the 120pt banner, which is
                the overlap mockup `04` draws. Move the banner out of the scroll and this number
                pulls the avatar ABOVE y=0 instead, off the top of the content. See the cover's own
                comment for the version of this that shipped broken.
              */}
              <View style={{ marginTop: -56, marginBottom: spacing.md }}>
                {/* `?? null` at entry: `avatarUrl` is a new DTO field and arrives `undefined`
                    from an API older than the app. See `AGENTS.md`. */}
                <Initials name={data.displayName} uri={data.avatarUrl ?? null} />
              </View>

              <Text
                style={{
                  fontFamily: 'GoogleSansFlex_700Bold',
                  fontSize: type.screenTitle.size,
                  color: palette.ink,
                }}
              >
                {data.displayName}
              </Text>

              {username && !isDeletedUsername(username) && (
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_400Regular',
                    fontSize: 13.5,
                    color: palette.muted,
                    marginTop: 4,
                  }}
                >
                  @{username}
                </Text>
              )}

              {data.verifiedBadge !== null && (
                <Badge
                  tone="verified"
                  label={VERIFIED_BADGE_LABEL[data.verifiedBadge]}
                  style={{ marginTop: spacing.sm }}
                />
              )}

              {/* THREE cells, not the prototype's four. `satisfaction` is cut (§4.3):
                  computed from the same reviews as the rating beside it, it would be
                  the same information a third time on one screen and could visibly
                  contradict the histogram below. */}
              <View style={{ flexDirection: 'row', marginTop: spacing.lg }}>
                <Stat
                  value={data.rating === null ? '-' : `★ ${ratingLabel(data.rating)}`}
                  label={avisLine(data.reviewCount)}
                />
                <Stat value={String(data.repairCount)} label="réparations" />
                <Stat value={sinceLabel(data.repairerSince)} label="Réparateur depuis" />
              </View>

              {/* `CF-51`. The radius joins the zone line rather than getting its own row: they
                  are one fact read left to right, and a lone « 20 km » says nothing.
                  `?? null` on the NEW field - an app newer than the API receives it as
                  `undefined`, and interpolating that renders « rayon de undefined km ». */}
              {zoneLine !== null && (
                <Text style={[styles.metaLine, { color: palette.muted, marginTop: spacing.md }]}>
                  {zoneLine}
                </Text>
              )}

              {/* Section HIDDEN when empty rather than rendered with a placeholder. All
                  three réparateurs in production have a null bio today. */}
              {data.bio !== null && (
                <>
                  <SectionLabel>À propos</SectionLabel>
                  <Text
                    style={{
                      fontFamily: 'GoogleSansFlex_400Regular',
                      fontSize: 13.5,
                      lineHeight: 20,
                      color: palette.ink2,
                    }}
                  >
                    {data.bio}
                  </Text>
                </>
              )}

              {/* `CF-25`. « Spécialités » - what he DECLARES, above « Catégories traitées », which is what
                  he has actually quoted on. Both sections, declared first, on the owner's decision (design
                  §3 Q2). The two are not redundant and must not be collapsed: one is a claim, the other a
                  fact, and today only this one can render because there are zero offers.

                  Taxonomy-ordered by the server, so the chips do not reshuffle between saves. */}
              {specialities.length > 0 && (
                <>
                  <SectionLabel>Spécialités</SectionLabel>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {specialities.map((s) => (
                      <Badge key={s} tone="neutral" label={s} />
                    ))}
                  </View>
                </>
              )}

              {/* « Catégories traitées », never « Spécialités »: derived from what he
                  has quoted on, which is a fact, not a claim he made. 🆕 `CF-25` added the DECLARED section directly above -
                  that one is his claim. Neither replaces the other. */}
              {data.categoriesTreated.length > 0 && (
                <>
                  <SectionLabel>Catégories traitées</SectionLabel>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {data.categoriesTreated.map((c) => (
                      <Badge key={c} tone="neutral" label={c} />
                    ))}
                  </View>
                </>
              )}

              {/* `CF-52`. HIDDEN ENTIRELY when the array is empty, and that is the whole point of the
                  seven-or-none rule: no rows means « has not answered », which is NOT « closed all
                  week ». Seven closed rows renders seven « Fermé » lines, which is a real statement.
                  `?? []` is mandatory on this new field. */}
              {(data?.availability ?? []).length > 0 && (
                <View style={{ marginTop: spacing.lg }}>
                  <SectionLabel>Horaires</SectionLabel>
                  <Card style={{ padding: 0 }}>
                    {(data?.availability ?? []).map((d, i, all) => (
                      <View
                        key={d.dayOfWeek}
                        style={[
                          styles.hoursRow,
                          { borderBottomColor: palette.line, borderBottomWidth: i === all.length - 1 ? 0 : 1 },
                        ]}
                      >
                        {/* Safe: migration 29 enforces CHECK ("dayOfWeek" BETWEEN 1 AND 7) */}
                        <Text style={[styles.hoursDay, { color: palette.ink }]}>
                          {DAY_LABELS_FR[d.dayOfWeek as DayOfWeek]}
                        </Text>
                        <Text style={[styles.hoursValue, { color: d.closed ? palette.muted : palette.ink }]}>
                          {formatDayHours(d)}
                        </Text>
                      </View>
                    ))}
                  </Card>
                </View>
              )}

              <SectionLabel>Avis clients</SectionLabel>

              {reviews.isError ? (
                <Card>
                  <Text
                    style={{
                      fontFamily: 'GoogleSansFlex_500Medium',
                      fontSize: 13,
                      color: palette.red,
                    }}
                  >
                    Impossible de charger les avis. Tirez vers le bas pour réessayer.
                  </Text>
                </Card>
              ) : reviews.data && reviews.data.length === 0 ? (
                <Card>
                  <Text
                    style={{
                      fontFamily: 'GoogleSansFlex_400Regular',
                      fontSize: 13,
                      color: palette.muted,
                    }}
                  >
                    Aucun avis pour le moment.
                  </Text>
                </Card>
              ) : reviews.data ? (
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <Text
                      style={{
                        fontFamily: 'GoogleSansFlex_700Bold',
                        fontSize: 32,
                        color: palette.ink,
                      }}
                    >
                      {data.rating === null ? '-' : ratingLabel(data.rating)}
                    </Text>
                    <RatingBreakdown reviews={reviews.data} />

                  </View>

                  {reviews.data.map((rv) => {
                    // No demo pill (CF4-37 L1): since PRE-2 the API never lists a demo review.
                    return (
                    <View
                      key={rv.id}
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: palette.line,
                        paddingVertical: spacing.md,
                        marginTop: spacing.md,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {/* First name only, and NO avatar - Étape 5 §4.5. */}
                        <Text
                          style={{
                            fontFamily: 'GoogleSansFlex_600SemiBold',
                            fontSize: 13.5,
                            color: palette.ink,
                            flexShrink: 1,
                          }}
                        >
                          {rv.authorName}
                        </Text>
                        <View style={{ flex: 1 }} />
                        <Text
                          style={{
                            fontFamily: 'GoogleSansFlex_500Medium',
                            fontSize: 12,
                            color: palette.muted,
                          }}
                        >
                          ★ {rv.rating}
                        </Text>
                      </View>
                      {rv.comment !== null && (
                        <Text
                          style={{
                            fontFamily: 'GoogleSansFlex_400Regular',
                            fontSize: 13,
                            lineHeight: 19,
                            color: palette.ink2,
                            marginTop: 6,
                          }}
                        >
                          {rv.comment}
                        </Text>
                      )}
                    </View>
                    );
                  })}
                </Card>
              ) : null}

              {error !== null && (
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_500Medium',
                    fontSize: 13,
                    color: palette.red,
                    marginTop: spacing.md,
                  }}
                >
                  {error}
                </Text>
              )}
            </>
          )}
        </View>
      </ScrollView>
      )}

      {showBar && data && (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: spacing.lg,
            gap: spacing.sm,
            backgroundColor: palette.paper,
            borderTopWidth: 1,
            borderTopColor: palette.line,
          }}
        >
          {canChoose && offerId !== undefined && demandeId !== undefined && (
            <Button
              label="Choisir cette offre"
              onPress={() => router.push(`/demande/${demandeId}/paiement?offerId=${offerId}`)}
            />
          )}
          {canQuote && existingQuoteDemande && (
            <Button
              label="Voir ma demande de devis"
              variant="secondary"
              onPress={() => router.push(`/demande/${existingQuoteDemande.id}`)}
            />
          )}
          {canQuote && !existingQuoteDemande && (
            // CF4-25: a private quote request now, no longer the Contacter conversation.
            // « Contacter » below is unchanged and still opens the conversation.
            <Button
              label="Demander un devis"
              onPress={() => router.push(`/devis/nouveau?repairerId=${userId}`)}
            />
          )}
          {canContact && (
            <Button
              label="Contacter"
              variant={canQuote || canChoose ? 'secondary' : 'primary'}
              onPress={onContact}
              loading={openConversation.isPending}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function SectionLabel({ children }: { children: string }) {
  const { palette, spacing } = useTheme();
  return (
    <Text
      style={{
        fontFamily: 'GoogleSansFlex_700Bold',
        fontSize: 12,
        letterSpacing: 0.6,
        color: palette.muted,
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
      }}
    >
      {children.toUpperCase()}
    </Text>
  );
}

/**
 * One cell of the three-column row under the name.
 *
 * 🛑 THE VALUE MAY NEVER WRAP, and that is what keeps the three labels on one baseline. A
 * two-line value in one cell pushes only that cell's label down, so the row reads as broken
 * even though every cell is individually correct - reported from a device on 2026-08-20, when
 * « moins d'un mois » wrapped beside « - » and « 0 ».
 *
 * Two mechanisms, because one is not enough: `numberOfLines={1}` is the hard guarantee, and
 * `adjustsFontSizeToFit` makes an over-long value SHRINK rather than ellipsise, so it stays
 * readable instead of becoming « moins d'u… ». Same pairing `ClientHome`'s headline uses and for
 * the same reason. `minimumFontScale` stops the shrink going below legible.
 *
 * The LABEL may wrap, to two lines: if one does, the row grows but all three labels still START
 * level, so the alignment holds. Cells stay `flex: 1` rather than the prototype's content-sized
 * `space-around` - equal thirds are steadier across varying values, and there are three cells
 * here where the prototype has four.
 */
function Stat({ value, label }: { value: string; label: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text
        style={{ fontFamily: 'GoogleSansFlex_700Bold', fontSize: 17, color: palette.ink }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {value}
      </Text>
      <Text
        style={{
          fontFamily: 'GoogleSansFlex_400Regular',
          fontSize: 11.5,
          color: palette.muted,
          marginTop: 2,
          textAlign: 'center',
        }}
        numberOfLines={2}
      >
        {label}
      </Text>
    </View>
  );
}

function avisLine(count: number): string {
  return count === 1 ? '1 avis' : `${count} avis`;
}

/**
 * « Réparateur depuis », from `RepairerProfile.createdAt`. NOT the prototype's « sur
 * Revime » - that column records when he enabled réparateur mode, and `user.createdAt`
 * is the other date. A label asserting more than the data delivers is this repo's own
 * named defect class.
 *
 * 🛑 EVERY BRANCH RETURNS A SHORT TOKEN, and that is a layout contract rather than a style
 * choice. This value sits in a cell that is one third of the screen beside two others whose
 * values are at most three characters. The `< 1 mois` case used to read « moins d'un mois » -
 * 15 characters - which wrapped to two lines and pushed its label a line below the other two,
 * breaking the row's baseline. That is the misalignment reported from a device on 2026-08-20.
 *
 * The prototype's own values are « 2 ans », « 3 ans », « 4 ans » (`data.ts:122`), so a token is
 * what this column was designed around. `Stat` now also refuses to wrap a value, so a future
 * long one degrades by shrinking instead of breaking the row - but keep them short anyway;
 * shrinking is the safety net, not the plan.
 */
function sinceLabel(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '-';
  const months = Math.max(
    0,
    Math.floor((Date.now() - then.getTime()) / (1000 * 60 * 60 * 24 * 30.44)),
  );
  if (months < 1) return '< 1 mois';
  if (months < 12) return months === 1 ? '1 mois' : `${months} mois`;
  const years = Math.floor(months / 12);
  return years === 1 ? '1 an' : `${years} ans`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaLine: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13.5 },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  hoursDay: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 14 },
  hoursValue: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14 },
});
