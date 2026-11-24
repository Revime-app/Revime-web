import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { useTheme } from '../theme';
import { Badge } from './Badge';
import { FavoriteHeart } from './FavoriteHeart';
import { IconCamera, IconLocation } from '../icons';
import {
  euros,
  timeAgoLabel,
  formatPublicLocation,
  type FeedItem,
  type DemandeStatus,
  type RepairTone,
} from '@revime/shared';

/**
 * One demande as the FAB feed shows it - the prototype's `DemandeCard`
 * (`repareme-web/src/components.tsx:270-325`), rendered by `FilDemandes`.
 *
 * 🛑 **DELIBERATELY NOT THE SAME ROW THE RECHERCHE TAB USES**, and the difference is the
 * prototype's, not an inconsistency: `/pro/demandes` is where a réparateur BROWSES, so it is
 * photo-led and generous; `/pro/recherche` is where he SEARCHES, so it is a flat scannable
 * `.result-row` list. Both are fed by `GET /demandes/feed`; only the presentation differs.
 * (Both briefly shared the flat row on 2026-08-20, which is how this screen came to look wrong.)
 *
 * The prototype's `Déplacement / Dépôt / Colis` badge row is **absent**, for the fourth surface
 * running: those are delivery modes, `Demande` has no such column, and the Étape 4b spec §3
 * settled it - delivery is the réparateur's capability on an `Offer` plus the client's choice at
 * checkout, never a property of a demande.
 */

/** `height: 150; object-fit: cover` on the prototype's cover image. */
const COVER_H = 150;

/**
 * What a saved annonce's badge may say, for each member of `demandeStatusSchema` that is not
 * `OPEN`. `CF-19` / `CF-27`.
 *
 * 🛑 **CORRECTED 2026-08-31 BY THE WHOLE-BRANCH REVIEW. THIS USED TO BE ONE BOOLEAN RENDERING
 * « Clôturée » FOR EVERY NON-`OPEN` STATUS, AND « Clôturée » IS NOT A VALUE THIS PRODUCT HAS.**
 * `demandeStatusSchema` is `['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']` and the string `CLOSED`
 * appears nowhere in it - the only place it existed was the two lines of
 * `favorites-demandes.spec.ts` that this fix rewrote, so the one test exercising the new field
 * asserted a value the enum forbids. On screen the boolean mislabelled `IN_PROGRESS` outright: a
 * demande being repaired right now was badged as closed.
 *
 * A `Record` over `Exclude<DemandeStatus, 'OPEN'>` rather than a boolean, so this map is TOTAL over
 * the union and adding a fifth status is a `TS2741` here - the trick `apps/mobile/AGENTS.md`
 * records for `ICON_FOR` over `NotificationType`, and the only compile-time gate this workspace has.
 *
 * **The labels and the tones both come from `packages/shared/src/repair-status.ts`'s
 * `repairStatus()`, which calls itself « the single place that decides where a demande/commande
 * sits… a second implementation is how the two come to disagree ».** `DONE` is that function's
 * client index 7, « Fonds versés au réparateur », tone `verified`; `CANCELLED` is its `exit`
 * whose label is literally typed `'Annulée'`, tone `neutral`.
 *
 * 🛑 **`IN_PROGRESS` IS THE ONE THAT CANNOT BORROW A CHAIN LABEL, AND THAT IS WHY IT IS « En
 * cours » AND NOT ONE OF THE LADDER'S OWN.** `repairStatus()` needs a `commande` to place an
 * `IN_PROGRESS` demande, and it could be at index 2 (« Offre sélectionnée — Paiement en
 * attente »), 3 (« Paiement effectué ») or 4 (« Réparation en cours »). `FavoriteDemandeItem`
 * carries no commande, so **calling `repairStatus({ demandeStatus: status, offerCount: 0,
 * commande: null }, 'CLIENT')` here would be WRONG rather than approximate**: with a null
 * commande that function returns index 0 for `IN_PROGRESS`, i.e. « En attente d'offres », and
 * `offersStillMatter` would then answer `true` for a demande that has moved on. « En cours » is
 * the weakest statement true of all three positions, and it is established copy on this app
 * already (`profil.tsx`'s client stat, « Mes réparations / En cours et terminées »).
 *
 * The TONE is determinate even though the label is not: client indices 2, 3 and 4 are `neutral`,
 * `amber` and `amber` respectively in `repairStatus()` - so this map keeps its own `amber`
 * verbatim, which is right for indices 3 and 4 and a deliberately approximate but non-alarming
 * choice for index 2 (`neutral` there), since a single `IN_PROGRESS` badge cannot carry three
 * different tones either.
 *
 * MEASURED against `Badge.tsx:41`, which is `GoogleSansFlex_700Bold` at **11pt** - not the 12pt the
 * comment on the badge below used to claim. Plus 9pt of padding each side:
 *
 *   « En cours »            46.2pt label → 64.2pt badge
 *   « Réparation terminée » 111.5pt      → 129.5pt   (the widest)
 *   « Annulée »             44.0pt       → 62.0pt
 *
 * The card's inner width on a 375pt iPhone SE is **315pt** (375 − 2 × `spacing.lg` for the list's
 * padding, then − 2 × 14 for this card's own), so the widest badge uses 41% of its own row.
 */
const STATUS_BADGE: Record<
  Exclude<DemandeStatus, 'OPEN'>,
  { label: string; tone: RepairTone }
> = {
  IN_PROGRESS: { label: 'En cours', tone: 'amber' },
  DONE: { label: 'Réparation terminée', tone: 'verified' },
  CANCELLED: { label: 'Annulée', tone: 'neutral' },
};

type Props = {
  demande: FeedItem;
  /** Passed in so every card in one frame formats its age against the same instant. */
  now: Date;
  onPress: () => void;
  /**
   * `CF-19` / `CF-27`. All three are OPTIONAL and only `/favoris` passes them, so the feed and
   * `NearbyDemandeRow` render byte-identically. Favouriting from a feed ROW is deliberately
   * not in this slice - see the design §11.
   *
   * `status` exists because a SAVED demande can close, unlike anything the feed returns.
   * Read it through `?? null` at the call site, per AGENTS.md: this app can be newer than the
   * API it talks to, so a new field arrives `undefined` and `undefined !== null` passes every
   * null guard.
   *
   * 🛑 **`| null` IS DELIBERATE AND WAS ADDED 2026-08-31, because `?` alone made the type LIE about
   * what the one caller passes.** `FavoriteDemandeItem.status` is non-nullable, so `d.status ?? null`
   * is typed `DemandeStatus` and `tsc` sees no null here - while at runtime it is exactly `null`
   * whenever the API predates the field. This widening makes the guard's necessity visible in the
   * signature. Read it with a LOOSE `!= null`; see the derivation in the component.
   */
  status?: DemandeStatus | null;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
};

export function DemandeCard({ demande: d, now, onPress, status, isFavorite, onToggleFavorite }: Props) {
  const { palette, radii, spacing } = useTheme();

  /**
   * 🛑 `!= null`, LOOSE, AND NOT `!== undefined`. `favoris.tsx` normalises the field at entry with
   * `d.status ?? null` - which is the right thing to do per `AGENTS.md`, because a new DTO field
   * arrives `undefined` from an API older than the app. The old test here was `!== undefined`, so
   * that normalisation turned « the API did not say » into `null`, `null !== undefined` is **true**,
   * and **every saved annonce rendered as closed.** The stale-API guard made the failure worse than
   * no guard: without the `?? null` the same expression would correctly have been `false`. `tsc`
   * cannot see it, because `FavoriteDemandeItem.status` is non-nullable in the type.
   *
   * A loose nullish check is correct for either caller - normalising or not - which is what stops
   * this depending on a convention two files apart.
   *
   * The card stays TAPPABLE whatever the status: `onPress` is `router.push('/demande/:id')` at every
   * call site, and a demande the user deliberately saved must remain openable. The design doc §9's
   * own correction records why gating it would be a new defect.
   */
  const statusBadge = status != null && status !== 'OPEN' ? STATUS_BADGE[status] : null;

  return (
    /**
     * 🛑 TWO VIEWS, AND THE SPLIT IS THE WHOLE POINT: the shadow is on the OUTER one and
     * `overflow: 'hidden'` on the INNER one.
     *
     * A view that clips also clips ITS OWN SHADOW - `masksToBounds` on iOS, dropped on Android.
     * The first version of this card put both on one `Pressable`, and since React Native
     * FLATTENS a style array onto a single view, `styles.card`'s `overflow` and the inline
     * `shadowOpacity` landed together. Result on device: **no card boundary at all**, because
     * `.card--float` sets `border-color: transparent`, so the prototype's only edge IS that
     * shadow.
     *
     * `PromoBanner.tsx:54` already records this trap and already uses this split. It should have
     * been copied rather than rediscovered.
     */
    <View
      style={{
        borderRadius: radii.card,
        // `.card--float`'s `--shadow-card: 0 6px 22px rgba(16,24,40,0.07)`, the same values
        // `Card` uses, so the two containers read as one family. `Card` itself is not reused
        // because this one needs zero padding and a clipped, bleeding cover image.
        shadowColor: '#101828',
        shadowOpacity: 0.07,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 6 },
        elevation: 3,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={d.title}
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: palette.paper,
            borderRadius: radii.card,
            borderCurve: 'continuous',
            transform: [{ scale: pressed ? 0.985 : 1 }],
          },
        ]}
      >
        <View style={styles.cover}>
          {/* A truthy test, NOT `!== null`: `photoUrl` reached `FeedItem` on 2026-08-20, so it can
              arrive `undefined` from a client pointed at an api that predates it. See the
              AGENTS.md constraint.

              🛑 **`cover`, corrected 2026-08-21. This was `contain`, and the reasoning that chose
              it is withdrawn rather than deleted:** it argued that `contain` over a mist ground let
              the fallback tile and a real photo occupy the same box without cropping a portrait
              photo through its subject. That was written when no photo existed anywhere in the
              product, so it optimised for a hypothetical portrait upload at the cost of every real
              one. With photos live, the owner reported the actual result from his phone - a gap
              framing all four sides of every image, because this box is about 2.29:1 and a
              landscape photo is nearer 1.78:1. `cover` is also what the prototype specified all
              along (see `COVER_H`'s own comment). The portrait-crop cost is accepted: it is the
              tradeoff the prototype made, and no fit setting avoids it in a wide cover strip. */}
          {d.photoUrl ? (
            <Image
              source={{ uri: d.photoUrl }}
              style={styles.coverImage}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={[styles.coverEmpty, { backgroundColor: palette.mist }]}>
              <IconCamera size={26} color={palette.faint} strokeWidth={1.8} />
            </View>
          )}

          {/* The pricing posture, overlaid top-left. `rgba(20,20,20,0.82)` is the prototype's
              own value; its `backdrop-filter: blur(4px)` has no React Native equivalent and is
              dropped rather than paid for with a native dependency. */}
          <View style={styles.badgeTopLeft}>
            <Badge
              tone="dark"
              style={styles.overlayBadge}
              label={
                d.mode === 'BUDGET' && d.budgetCents !== null
                  ? `Budget ${euros(d.budgetCents)}`
                  : 'Recherche d’offres'
              }
            />
          </View>

          {/* MIRRORS the price badge rather than joining the footer. The prototype has no
              equivalent because it has no offer state, and the footer is a two-item
              space-between with nowhere for a third. Top-right also reads as "my status with
              this demande", opposite the demande's own status. */}
          {d.hasMyOffer && (
            <View style={styles.badgeTopRight}>
              <Badge tone="verified" label="Offre envoyée" />
            </View>
          )}

          {/* `CF-19` / `CF-27`: Favourite control on saved demandes. Top-right corner, below
              "Offre envoyée" if both exist (unlikely: saved demandes are browsing context, offers
              are action context). */}
          {onToggleFavorite && (
            <View style={[styles.badgeTopRight, d.hasMyOffer && { top: 56 }]}>
              <FavoriteHeart
                filled={Boolean(isFavorite)}
                onToggle={onToggleFavorite}
                size={24}
              />
            </View>
          )}
        </View>

        <View style={{ padding: 14 }}>
          <Text style={[styles.title, { color: palette.ink }]} numberOfLines={2}>
            {d.title}
          </Text>

          {/* `CF-19` / `CF-27`: a saved annonce that has moved on. The label and tone come from
              `STATUS_BADGE` above, which carries the measurements and the reason « Clôturée » is
              gone. On its own row rather than squeezed into the metaRow, because this is a headline
              state: the widest label is a 129.5pt badge against 315pt of card. */}
          {statusBadge !== null && (
            <View style={{ marginTop: 6 }}>
              <Badge tone={statusBadge.tone} label={statusBadge.label} />
            </View>
          )}

          <View style={styles.metaRow}>
            <Text style={[styles.meta, { color: palette.muted }]} numberOfLines={1}>
              {d.categoryLabelFr} · {formatPublicLocation(d.locationLabel)}
            </Text>
            {/* Distance is null until the réparateur saves a postal code, so the pin and the
                value appear together or not at all - never a dangling separator. */}
            {d.distanceKm !== null && (
              <>
                <IconLocation size={12} color={palette.muted} strokeWidth={2.4} />
                <Text style={[styles.meta, { color: palette.muted }]}>
                  {String(d.distanceKm).replace('.', ',')} km
                </Text>
              </>
            )}
          </View>

          {/*
            🛑 THE OFFER COUNT IS SUPPRESSED ONCE THE DEMANDE HAS MOVED ON, and this is the second
            half of the same defect the badge above fixes. `offersLine` used to render
            unconditionally, so `/favoris` reproduced the exact contradiction the client reported on
            2026-08-21: « 1 offre reçue » sitting beside a badge saying the demande is finished.

            `packages/shared/src/repair-status.ts` exports `offersStillMatter` to be the ONE
            definition of this rule, and its comment names that contradiction verbatim. It is not
            called here on purpose, and the reason is in `STATUS_BADGE` above: it takes a
            `RepairStatus`, `FavoriteDemandeItem` carries no `commande`, and
            `repairStatus({ demandeStatus: status, offerCount: 0, commande: null }, 'CLIENT')`
            answers index 0 for an `IN_PROGRESS` demande - so the shared predicate fed a null
            commande would return `true` and reproduce the bug it exists to prevent.

            🛑 **SO THIS IS A WEAKER RULE THAN THE PREDICATE, AND THE RESIDUAL IS WORTH STATING
            RATHER THAN GLOSSING.** On the three non-`OPEN` statuses the two agree, and where the
            predicate would be wrong for want of a commande this errs towards suppressing. They can
            DISAGREE in one reachable state: an `OPEN` demande that already has a `PENDING_PAYMENT`
            commande - the client picked an offer and owes payment, and `payments.service.ts` keeps
            the demande `OPEN` until he pays. `mes-demandes.tsx` has the commande and hides the count
            there; this card does not have it and still shows it. Closing that gap means putting a
            `commande` on `FavoriteDemandeItem`, which is a DTO change and not this fix's scope. The
            client's reported case - a count beside a demande that has visibly moved on - is closed.

            `statusBadge === null` covers BOTH « the API did not say » and `OPEN`, so the feed and
            `NearbyDemandeRow` - which pass no `status` at all - render byte-identically.

            `justifyContent` flips to `flex-end` when the count is gone, or `space-between` with one
            child would drag the age across to the left edge.
          */}
          <View
            style={[
              styles.footer,
              { marginTop: spacing.md },
              statusBadge !== null && { justifyContent: 'flex-end' },
            ]}
          >
            {statusBadge === null && (
              <Text style={[styles.offers, { color: palette.ink }]}>{offersLine(d.offerCount)}</Text>
            )}
            <Text style={[styles.age, { color: palette.muted }]}>
              {timeAgoLabel(d.createdAt, now) ?? ''}
            </Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

/**
 * « 2 offres reçues ». Both words agree with the count, which French requires and a naive
 * `offre(s) reçue(s)` would fudge - the prototype spells both out for the same reason.
 */
function offersLine(count: number): string {
  if (count === 0) return 'Aucune offre reçue';
  return count === 1 ? '1 offre reçue' : `${count} offres reçues`;
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  cover: { height: COVER_H, position: 'relative' },
  coverImage: { width: '100%', height: COVER_H },
  coverEmpty: { width: '100%', height: COVER_H, alignItems: 'center', justifyContent: 'center' },
  badgeTopLeft: { position: 'absolute', top: 12, left: 12 },
  badgeTopRight: { position: 'absolute', top: 12, right: 12 },
  /** The prototype's translucent ink, overriding `tone="dark"`'s solid fill. */
  overlayBadge: { backgroundColor: 'rgba(20,20,20,0.82)' },
  title: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 15, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, flexWrap: 'wrap' },
  meta: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12.5 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  offers: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 12 },
  age: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12 },
});
