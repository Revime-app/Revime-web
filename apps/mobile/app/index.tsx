import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Easing, PanResponder } from 'react-native';
import { useRouter, Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Ellipse } from 'react-native-svg';
import { useTheme } from '../src/theme';
import { Button } from '../src/components/Button';
import { BrandWordmark } from '../src/components/BrandWordmark';
import { IconVerified, IconHeart, IconArrowRight } from '../src/icons';
import { useSessionContext } from '../src/lib/session';

type Slide = {
  img: ReturnType<typeof require>;
  badge?: 'verified' | 'heart';
  titleBefore: string;
  titleAccent: string;
  titleAfter: string;
  subtitle: string;
  blob: '1' | '2' | '3';
};

const slides: Slide[] = [
  {
    img: require('../assets/illustrations/app-hero.webp'),
    blob: '1',
    titleBefore: 'Ne remplacez plus.\n',
    titleAccent: 'Réparez.',
    titleAfter: '',
    subtitle: 'La plateforme qui met en relation les clients et les réparateurs de confiance.',
  },
  {
    img: require('../assets/illustrations/repair-toolbox.webp'),
    blob: '2',
    badge: 'verified',
    titleBefore: 'Des ',
    titleAccent: 'réparateurs',
    titleAfter: ' de confiance, près de chez vous.',
    subtitle: "Comparez prix, avis et délais. Vous décidez, jamais l'algorithme.",
  },
  {
    img: require('../assets/illustrations/armchair.webp'),
    blob: '3',
    badge: 'heart',
    titleBefore: 'Donnez une ',
    titleAccent: 'seconde vie',
    titleAfter: ' à vos objets.',
    subtitle: 'Un objet en panne trouve un réparateur de confiance près de chez vous.',
  },
];

// Per-slide decoration colours from prototype CSS lines 917-919
const SLIDE_BLOB_COLORS = {
  '1': '#fbeee6',
  '2': '#e8f3ee',
  '3': '#e7eef7',
} as const;

export default function Intro() {
  const router = useRouter();
  const { palette, accent } = useTheme();
  const { session, loading } = useSessionContext();
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);

  // Slide transition, transcribed from the prototype's keyframes rather than invented:
  // .fade-in (styles.css:468-479), .intro-badge (896-901), .intro-copy (986-992).
  // The prototype replays these by remounting on `key={i}`; here one state change drives
  // all three, which is what keeps them from desyncing.
  const imgAnim = useRef(new Animated.Value(0)).current;
  const copyAnim = useRef(new Animated.Value(0)).current;
  const badgeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (loading) return;
    imgAnim.setValue(0);
    copyAnim.setValue(0);
    badgeAnim.setValue(0);
    Animated.parallel([
      // .fade-in: fade 0.34s cubic-bezier(0.2, 0.7, 0.3, 1)
      Animated.timing(imgAnim, {
        toValue: 1,
        duration: 340,
        easing: Easing.bezier(0.2, 0.7, 0.3, 1),
        useNativeDriver: true,
      }),
      // .intro-copy: intro-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)
      Animated.timing(copyAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
      // .intro-badge: intro-badge-pop 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.12s
      Animated.timing(badgeAnim, {
        toValue: 1,
        duration: 500,
        delay: 120,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
    ]).start();
  }, [currentIndex, loading, imgAnim, copyAnim, badgeAnim]);

  /**
   * FORWARD ONLY, and expressed as a function that CANNOT go back rather than as a
   * `goto(delta)` whose callers are trusted to pass +1.
   *
   * Owner's instruction, 2026-08-21: *"once user move forwade to onboarding screen simply
   * dont let the user scroll back"*. It previously took a signed delta and the pan handler
   * passed `-1` on a rightward swipe, clamped at 0 - so backward movement was a supported
   * operation the whole component was built around. Deleting only the call site would leave
   * the capability one line away from returning; there is no test here to stop that
   * (`apps/mobile` has only a `typecheck` script), so the affordance is removed instead.
   *
   * Still clamped at the top so the last slide absorbs a further swipe rather than running
   * past the deck, and still a functional update so the panResponder's first-render closure
   * cannot go stale.
   */
  const next = () => setCurrentIndex((n) => Math.min(slides.length - 1, n + 1));

  const panResponder = useRef(
    PanResponder.create({
      // Claim only clearly horizontal drags, so a tap is never swallowed
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
      /**
       * -50px on release advances. The prototype's threshold was ±50 (Intro.tsx:65-66) and
       * the rightward half is deliberately gone.
       *
       * A rightward swipe is now SILENTLY IGNORED, which is the intended feel: the deck does
       * not rubber-band or flash, it simply does not move. Note the gesture is still CLAIMED
       * by `onMoveShouldSetPanResponder` above, so a right-drag is swallowed rather than
       * falling through to anything behind it - that is what stops it reaching a parent
       * scroll or the navigator's own back gesture.
       */
      onPanResponderRelease: (_, g) => {
        if (g.dx < -50) next();
      },
    })
  ).current;

  // DEFECT 5: redirect authenticated users to tabs
  // Only redirect when loading is complete and session exists
  if (!loading && session) {
    return <Redirect href="/(tabs)" />;
  }

  // While loading or no session, show nothing or continue to onboarding
  if (loading) {
    return null;
  }

  const s = slides[currentIndex];
  const isLast = currentIndex === slides.length - 1;

  const advance = () => {
    if (isLast) {
      router.push('/(auth)/roles');
    } else {
      next();
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: palette.paper }]}>
      {/* CHANGE 1: Per-slide corner decoration from prototype, ScreenMotif removed */}
      {currentIndex === 0 && <View style={[styles.introSwoosh, { backgroundColor: palette.red }]} />}
      {currentIndex > 0 && (
        <>
          {/* Slide 1 top: 128×128 circle, red */}
          {currentIndex === 1 ? (
            <View style={[
              styles.introCornerBlob,
              styles.s1Top,
              { backgroundColor: palette.red }
            ]} />
          ) : (
            /* Slide 2 top: 116×116 organic ellipse, green */
            <View style={[styles.introCornerBlob, styles.s2Top]} pointerEvents="none">
              <Svg width={116} height={116} viewBox="0 0 100 100">
                <Ellipse cx={50} cy={50} rx={46} ry={44} fill={palette.green} />
              </Svg>
            </View>
          )}
          {/* Slide 1 bottom: 104×104 circle, navy */}
          {currentIndex === 1 ? (
            <View style={[
              styles.introCornerBlob,
              styles.s1Bottom,
              { backgroundColor: palette.navy }
            ]} />
          ) : (
            /* Slide 2 bottom: 138×110 organic ellipse, amber */
            <View style={[styles.introCornerBlob, styles.s2Bottom]} pointerEvents="none">
              <Svg width={138} height={110} viewBox="0 0 100 100" preserveAspectRatio="none">
                <Ellipse cx={50} cy={50} rx={48} ry={44} fill={palette.amber} />
              </Svg>
            </View>
          )}
        </>
      )}

      <View style={[styles.container, { paddingTop: 18 + insets.top }]}>
        <View style={styles.top}>
          <BrandWordmark height={24} />
        </View>

        {/* Swipeable stage. One slide at a time, cross-faded - the prototype's .intro-stage,
            which is not a horizontal pager (Intro.tsx:86-105). */}
        <View style={styles.stage} {...panResponder.panHandlers}>
          <View style={styles.imageContainer}>
            {/* CHANGE 2: Organic ellipse blob behind illustration from prototype CSS lines 906-919 */}
            <View style={styles.introBlobContainer} pointerEvents="none">
              <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={styles.introBlobSvg}>
                <Ellipse cx={50} cy={50} rx={46} ry={44} fill={SLIDE_BLOB_COLORS[s.blob]} />
              </Svg>
            </View>
            <Animated.Image
              source={s.img}
              style={[
                styles.image,
                {
                  opacity: imgAnim,
                  transform: [
                    { translateY: imgAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
                  ],
                },
              ]}
              resizeMode="contain"
            />
            {s.badge && (
              <Animated.View
                style={[
                  styles.badge,
                  {
                    opacity: badgeAnim,
                    transform: [
                      { scale: badgeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
                    ],
                  },
                ]}
              >
                {s.badge === 'verified' ? (
                  <IconVerified size={26} color={palette.red} strokeWidth={2.4} />
                ) : (
                  <IconHeart size={24} color={palette.red} strokeWidth={2} />
                )}
              </Animated.View>
            )}
          </View>
        </View>

        <View style={styles.content}>
          <Animated.View
            style={[
              styles.copy,
              {
                opacity: copyAnim,
                transform: [
                  { translateY: copyAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
                ],
              },
            ]}
          >
            <Text style={[styles.title, { color: palette.ink }]}>
              {s.titleBefore}
              <Text style={{ color: accent.accent }}>{s.titleAccent}</Text>
              {s.titleAfter}
            </Text>
            <Text style={[styles.subtitle, { color: palette.muted }]}>
              {s.subtitle}
            </Text>
          </Animated.View>

          <View style={styles.dots}>
            {slides.map((_, idx) => (
              <View
                key={idx}
                style={[
                  styles.dot,
                  idx === currentIndex && [styles.dotActive, { backgroundColor: accent.accent }],
                  idx !== currentIndex && { backgroundColor: palette.line },
                ]}
              />
            ))}
          </View>

          <Button
            label={currentIndex === 0 ? 'Commencer ›' : 'Suivant ›'}
            onPress={advance}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    position: 'relative',
  },
  container: {
    flex: 1,
    paddingBottom: 26,
    gap: 16,
    zIndex: 2,
  },
  top: {
    paddingHorizontal: 22,
  },
  // .intro-stage (styles.css:871-879). The 22px inset stays on this wrapper rather than
  // moving onto imageContainer, so the blob's 78%/74% basis is byte-for-byte what was
  // verified on device after the double-scaling fix.
  stage: {
    flex: 1,
    paddingHorizontal: 22,
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  // CHANGE 2: Organic ellipse blob container (CSS lines 906-919)
  introBlobContainer: {
    position: 'absolute',
    width: '78%',
    height: '74%',
    left: '50%',
    top: '50%',
    transform: [{ translateX: '-50%' }, { translateY: '-50%' }],
    zIndex: 0,
  },
  introBlobSvg: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  image: {
    width: '86%',
    maxHeight: '100%',
    zIndex: 1,
  },
  badge: {
    position: 'absolute',
    right: '12%',
    bottom: '8%',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 10,
    zIndex: 3,
  },
  content: {
    paddingHorizontal: 22,
    gap: 24,
  },
  copy: {
    gap: 12,
  },
  title: {
    /**
     * 700, not 800. This asked for `Poppins_800ExtraBold`, which `_layout.tsx` never loaded,
     * so it silently rendered in the system font - caught 2026-08-20 during the charte swap.
     * Repointed to the heaviest weight the app actually loads rather than pulling in a fifth
     * weight for one string.
     */
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 29,
    lineHeight: 32,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 340,
  },
  dots: {
    flexDirection: 'row',
    gap: 7,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  dotActive: {
    width: 22,
  },
  // CHANGE 3: Per-slide decoration from prototype CSS lines 804-857
  // Slide 0 red swoosh bottom-right corner (CSS lines 804-815)
  introSwoosh: {
    position: 'absolute',
    right: -60,
    bottom: -50,
    width: 240,
    height: 200,
    borderTopLeftRadius: 144,      // 60% of 240
    borderTopRightRadius: 0,
    borderBottomRightRadius: 80,   // 40% of 200
    borderBottomLeftRadius: 0,
    opacity: 0.9,
    zIndex: 0,
  },
  // Corner blobs for slides 2 & 3 (colours from palette via inline styles)
  introCornerBlob: {
    position: 'absolute',
    opacity: 0.9,
    zIndex: 0,
  },
  // Slide 1 (index 1): red near top-left (128×128 circle), navy low on right edge (104×104 circle)
  s1Top: {
    width: 128,
    height: 128,
    top: -52,
    left: -40,
    borderRadius: 64,
  },
  s1Bottom: {
    width: 104,
    height: 104,
    bottom: 120,
    right: -56,
    borderRadius: 52,
  },
  // Slide 2 (index 2): green high on right (116×116 organic), amber low-left (138×110 organic)
  s2Top: {
    width: 116,
    height: 116,
    top: 60,
    right: -52,
  },
  s2Bottom: {
    width: 138,
    height: 110,
    bottom: -46,
    left: 30,
  },
});
