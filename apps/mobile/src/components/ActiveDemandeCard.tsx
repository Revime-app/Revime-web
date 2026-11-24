import { Pressable, View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { Badge } from './Badge';
import { IconArrowRight } from '../icons';
import { offersStillMatter, type RepairStatus, type DemandeListItem } from '@revime/shared';

/**
 * « Ma demande en cours » - the prototype's thesis card (`Accueil.tsx:100-137`): the
 * active request with a dark footer strip leading straight to the comparison.
 *
 * Two deliberate departures from the prototype, both because it only ever modelled one
 * hardcoded request:
 *
 * 1. **The badge keeps this app's own status map, so OPEN reads « En attente d'offres »
 *    in the neutral tone** rather than the prototype's amber « En attente ». The same
 *    demande is rendered on `/mes-demandes` from the same map, and one row showing two
 *    different tones for one status is worse than differing from a mock.
 * 2. **The footer is conditional.** The prototype hardcodes « 3 offres reçues · Voir &
 *    comparer », which is a promise the zero-offer case cannot keep: there is nothing to
 *    compare. With no offers the strip states that plainly and shows no arrow, so the
 *    affordance appears exactly when it works.
 */
type Props = {
  demande: DemandeListItem;
  status: RepairStatus;
  /** Opens the offers/comparison screen. Only wired while offers are still the point. */
  onPress: () => void;
  /** Opens the commande, once the demande is past the offer stage. */
  onPressCommande: () => void;
};

export function ActiveDemandeCard({ demande, status, onPress, onPressCommande }: Props) {
  const { palette, radii } = useTheme();

  /**
   * 🛑 BOTH of this card's faults hang off this one line, and it is why `CF-37` could not
   * be closed by re-reading the status map.
   *
   * `activeDemande()` selects OPEN *or* IN_PROGRESS, so a PAID demande renders on this
   * card by design. The old condition was `offerCount > 0` and nothing else, which
   * produced (a) « 1 offre reçue » under a badge reading « En cours » - literally the
   * pair the client quoted in his 2026-08-21 feedback - and (b) a live « Voir &
   * comparer » CTA on a repair he had already paid for.
   *
   * `offersStillMatter` is imported, NOT re-derived: `commandes.tsx` needs the identical
   * predicate and two copies of it is the duplication this whole slice exists to remove.
   */
  const offersAreThePoint = offersStillMatter(status);
  const hasOffers = demande.offerCount > 0;
  const plural = demande.offerCount > 1 ? 's' : '';

  return (
    // The shadow lives on an OUTER view because the inner one needs `overflow: 'hidden'`
    // for the dark footer to reach the rounded edges, and a view that clips also clips the
    // shadow it is trying to cast. `borderRadius` is repeated here on purpose and is not
    // redundant: an iOS shadow follows its own view's radius, so without it this card would
    // cast a RECTANGULAR shadow behind rounded corners. Same shape as `PromoBanner`.
    <View
      style={[styles.shadow, { borderRadius: radii.card }]}
    >
      <Pressable
        accessibilityRole="button"
        onPress={offersAreThePoint ? onPress : onPressCommande}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: palette.paper,
            borderRadius: radii.card,
            opacity: pressed ? 0.95 : 1,
          },
        ]}
      >
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={[styles.title, { color: palette.ink }]} numberOfLines={2}>
              {demande.title}
            </Text>
            <Text style={[styles.meta, { color: palette.muted }]} numberOfLines={1}>
              {demande.categoryLabelFr} · {demande.locationLabel}
            </Text>
          </View>
          <Badge label={status.label} tone={status.tone} />
        </View>

        <View style={[styles.footer, { backgroundColor: palette.ink }]}>
          <Text style={styles.footerCount}>
            {offersAreThePoint
              ? hasOffers
                ? `${demande.offerCount} offre${plural} reçue${plural}`
                : 'Aucune offre pour le moment'
              : status.label}
          </Text>
          {offersAreThePoint
            ? hasOffers && (
                <View style={styles.footerCta}>
                  <Text style={styles.footerCtaLabel}>Voir &amp; comparer</Text>
                  <IconArrowRight size={16} color="#ffffff" strokeWidth={2.4} />
                </View>
              )
            : status.exit === null && (
                <View style={styles.footerCta}>
                  <Text style={styles.footerCtaLabel}>Suivre</Text>
                  <IconArrowRight size={16} color="#ffffff" strokeWidth={2.4} />
                </View>
              )}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * SHADOW, NO BORDER - the prototype's class is `card card--float`, and
   * `.card--float` sets `box-shadow` and `border-color: transparent`
   * (`styles.css:253-256`). The first pass here used a 1px line border and no shadow,
   * which made this the only bordered card in the app: `src/components/Card.tsx` gives
   * every other card exactly the shadow reproduced here. `Card` itself is not reused
   * because this card needs zero padding and `overflow: hidden` for the dark footer to
   * reach its edges, and `Card` hardcodes `padding: spacing.lg`.
   *
   * 🛑 **These five properties used to sit in `card` BELOW, beside `overflow: 'hidden'`,
   * and were therefore invisible.** Fixed 2026-08-20 after the owner reported the card as
   * having no border. It had no boundary at all: `.card--float` sets
   * `border-color: transparent`, so the shadow IS the only edge, and a clipping view
   * discards its own shadow. It looked survivable only because the solid ink footer drew a
   * hard edge along the bottom, which is exactly what made it easy to miss for a day after
   * the identical bug was found and fixed on `DemandeCard`.
   *
   * `AGENTS.md` records the trap and why grep is a poor way to find it: a style ARRAY is
   * flattened onto ONE view, so `overflow` and a shadow can arrive from two different
   * objects and still land on the same element. Here they were in the SAME object, which is
   * the easiest version to read and was still shipped twice.
   */
  shadow: {
    shadowColor: '#101828',
    shadowOpacity: 0.07,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  /** Clipping ONLY. Nothing that casts a shadow may be added to this object. */
  card: {
    overflow: 'hidden',
  },
  // 18 top, 18 sides, 16 bottom, matching the prototype's `padding: "18px 18px 16px"`.
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  headText: { flex: 1 },
  title: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 17 },
  meta: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, marginTop: 4 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  footerCount: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14, color: '#ffffff' },
  footerCta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerCtaLabel: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13.5, color: '#ffffff' },
});
