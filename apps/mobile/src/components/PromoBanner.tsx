import { Pressable, View, Text, Image, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { IconArrowRight } from '../icons';

/** 1983x793, aspect 2.50, RGB with no alpha - a full-bleed background, not a cutout. */
const BG = require('../../assets/illustrations/home-hero-banner.webp');
/** 1000x667, aspect 1.50, RGBA. The alpha matters: the devices composite over the
 *  background instead of dropping a white rectangle onto it. */
const ART = require('../../assets/illustrations/banner1.webp');

/**
 * The promo banner: the brand hero graphic as a background, the client's headline and CTA
 * over it, and the broken-devices artwork on the right.
 *
 * Structure, bottom to top: background image → legibility scrim → devices art → content.
 * The scrim sits UNDER the art on purpose; putting it above would dim the devices too.
 *
 * Derived from the prototype's `.promo` (`Accueil.tsx:65-75`, `styles.css:602-680`) and
 * keeps its geometry - 190pt tall, `24px 22px` content padding, art at 120% of banner
 * height anchored right, and the red glow beneath. What it no longer keeps is the flat
 * `#e5122e` fill, replaced by the hero graphic at the owner's request on 2026-08-20.
 */

/** `min-height: 190px` on both `.promo` and `.promo__content`. */
const BANNER_H = 190;
/** `background-size: auto 120%` - the devices art is scaled to 120% of the banner HEIGHT. */
const ART_SCALE = 1.2;
/** Intrinsic 1000x667, kept as a ratio so width follows height rather than being a second magic number. */
const ART_ASPECT = 1000 / 667;
const ART_H = Math.round(BANNER_H * ART_SCALE);
const ART_W = Math.round(ART_H * ART_ASPECT);
/** `background-position: right -22px center`. */
const ART_RIGHT = -22;

/**
 * The legibility scrim, and the reason it changed shape with the background.
 *
 * It used to be a RED gradient, because the banner was a flat red fill and the only thing
 * the headline needed protecting from was the devices art. The hero graphic is red on the
 * left but navy through the middle and white on the right, so a red gradient would now
 * tint the navy wrongly. A dark gradient works against all three: the headline is white,
 * both the red and the navy are already dark, and this suppresses the devices art
 * specifically where the text crosses it.
 *
 * Alpha is kept low and it is fully transparent by 68%, so the graphic's white right side
 * and the devices are untouched.
 */
const SCRIM =
  'linear-gradient(95deg, rgba(8,12,24,0.42) 0%, rgba(8,12,24,0.16) 45%, rgba(8,12,24,0) 68%)';

export function PromoBanner({ onPress }: { onPress: () => void }) {
  const { palette, radii, spacing } = useTheme();

  return (
    // The shadow lives on an OUTER view because the inner one needs `overflow: hidden` to
    // crop both images, and a shadow on a view that also clips is dropped on Android.
    <View
      style={{
        marginTop: spacing.xl,
        borderRadius: radii.lg,
        shadowColor: palette.red,
        shadowOpacity: 0.3,
        shadowRadius: 17,
        shadowOffset: { width: 0, height: 12 },
        elevation: 8,
      }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.promo,
          {
            // Still the brand red, and still load-bearing: it shows for the instant before
            // the background decodes, and behind any edge the `cover` crop cannot reach.
            backgroundColor: palette.red,
            borderRadius: radii.lg,
            borderCurve: 'continuous',
            transform: [{ scale: pressed ? 0.99 : 1 }],
          },
        ]}
      >
        {/* `cover`, so the graphic fills the card with no letterboxing. It is aspect 2.50
            against a 1.88 card, so about 25% is cropped from the sides - roughly evenly,
            which keeps the red wedge on the left, the navy sweep through the middle and
            the white on the right. That composition is the reason to crop rather than
            squash it with `stretch`. */}
        <Image source={BG} style={styles.bg} resizeMode="cover" accessible={false} />

        <View style={[styles.scrim, { experimental_backgroundImage: SCRIM }]} pointerEvents="none" />

        <Image source={ART} style={styles.art} resizeMode="contain" accessible={false} />

        <View style={styles.content}>
          <Text style={styles.title}>
            Un objet cassé ?{'\n'}On s&apos;en occupe.
          </Text>
          <View style={[styles.cta, { backgroundColor: palette.paper, borderRadius: radii.pill }]}>
            <Text style={[styles.ctaLabel, { color: palette.ink }]}>Publier une demande</Text>
            <IconArrowRight size={14} color={palette.red} strokeWidth={2.4} />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  promo: { position: 'relative', overflow: 'hidden', minHeight: BANNER_H },
  bg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: undefined, height: undefined },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  art: {
    position: 'absolute',
    right: ART_RIGHT,
    // Vertically centred, which is what `center` means in `background-position`. The art is
    // taller than the banner, so this is negative and the overflow crops evenly.
    top: (BANNER_H - ART_H) / 2,
    width: ART_W,
    height: ART_H,
  },
  content: {
    // `.promo__content { padding: 24px 22px }`.
    paddingVertical: 24,
    paddingHorizontal: 22,
    minHeight: BANNER_H,
    justifyContent: 'center',
    // flex-start keeps the CTA pill hugging its label instead of stretching to the
    // banner's width, mirroring `.promo__cta { display: inline-flex }`.
    alignItems: 'flex-start',
    gap: 14,
  },
  title: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 20,
    // `line-height: 1.12` at 20px.
    lineHeight: 22,
    // `letter-spacing: -0.02em` at 20px.
    letterSpacing: -0.4,
    color: '#ffffff',
    // `text-shadow: 0 1px 12px rgba(120, 8, 18, 0.3)`, part of the legibility strategy
    // rather than decoration - and it is the half that still works if the CSS gradient
    // scrim is unavailable.
    textShadowColor: 'rgba(120, 8, 18, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 12,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    // `.promo__cta`: gap 8, padding 10px 15px, font-size 12.
    gap: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  ctaLabel: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 12 },
});
