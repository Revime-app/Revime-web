import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { enterSignedInApp } from '@revime/shared';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect, Ellipse } from 'react-native-svg';
import { useTheme } from '../../src/theme';
import { IconArrowRight, IconShieldCheck, IconVerified, IconPackage } from '../../src/icons';
import { applyModes } from '../../src/lib/apply-modes';
import { useSessionContext } from '../../src/lib/session';
import { completeRoleStep } from '../../src/lib/signup-actions';
import { ApiError } from '../../src/lib/api';
import { BrandWordmark } from '../../src/components/BrandWordmark';

// Screen decoration, transcribed from the prototype's roles screen
// (repareme-web/src/screens/Onboarding.tsx:16-25). It is TWO soft .intro-blob shapes and
// no dotted arc - ScreenMotif's composition 0 got the first blob's geometry exactly right
// but drew an arc where the second blob belongs, which is why it was removed here.
// Colours are the .intro-blob--1 / --3 values (styles.css:917-919); local literals for the
// blob palette are the one permitted exception, as in app/index.tsx.
const BLOB_PEACH = '#fbeee6';
const BLOB_BLUE = '#e7eef7';

function ScreenBlobs() {
  return (
    <>
      {/* .intro-blob--1: 200x200, top -60, right -50 */}
      <View style={styles.blobTopRight} pointerEvents="none">
        <Svg width={200} height={200} viewBox="0 0 100 100">
          <Ellipse cx={50} cy={50} rx={48} ry={44} fill={BLOB_PEACH} />
        </Svg>
      </View>
      {/* .intro-blob--3: 160x160, bottom -50, left -40 */}
      <View style={styles.blobBottomLeft} pointerEvents="none">
        <Svg width={160} height={160} viewBox="0 0 100 100">
          <Ellipse cx={50} cy={50} rx={48} ry={44} fill={BLOB_BLUE} />
        </Svg>
      </View>
    </>
  );
}

// Card artwork, transcribed from the prototype's .role2__art / .role2__scrim
// (repareme-web/src/styles.css:711-718) and Onboarding.tsx:40 and :65.
// Intrinsic sizes are read from the files: banner1 1000x667, repair-toolbox 800x800.
const CLIENT_ART = require('../../assets/illustrations/banner1.webp');
const CLIENT_ART_RATIO = 1000 / 667;
const REPAIRER_ART = require('../../assets/illustrations/repair-toolbox.webp');
const REPAIRER_ART_RATIO = 1;

type CardArtProps = {
  source: ReturnType<typeof require>;
  ratio: number;
  /** Scrim colour. Deliberately the card's own background rather than the prototype's
   *  #e5122e / #1a2440 literals: a scrim exists to fade the card colour over the art,
   *  and this project has already had to revert an #e5122e drift once. */
  scrim: string;
  gradientId: string;
  /** CSS stop offsets: client 14%->62%, repairer 34%->100%. */
  from: number;
  to: number;
};

function CardArt({ source, ratio, scrim, gradientId, from, to }: CardArtProps) {
  const [box, setBox] = useState({ w: 0, h: 0 });

  // Everything here is sized in PIXELS off a measured layout, not percentages. artClip's
  // own height is derived from its absolute insets, and Yoga measures a percentage child
  // against an inset-derived parent as 0 - which collapsed both the art (height 118%,
  // then aspectRatio gave it width 0) and the scrim (width/height 100%) to nothing.
  const artH = box.h * 1.18; // background-size: auto 118%

  return (
    <View
      style={styles.artClip}
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setBox((p) => (p.w === width && p.h === height ? p : { w: width, h: height }));
      }}
    >
      {box.h > 0 && (
        <>
          <Image
            source={source}
            style={{
              position: 'absolute',
              right: -20, // background-position: right -20px ...
              top: -(box.h * 0.09), // ... center, for a box 118% of the card
              height: artH,
              width: artH * ratio,
              opacity: 0.9,
            }}
            resizeMode="contain"
          />
          {/* linear-gradient(95deg, ...) - the 95deg tilt is the y2 offset */}
          <Svg style={StyleSheet.absoluteFill} width={box.w} height={box.h}>
            <Defs>
              <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0.09">
                <Stop offset={from} stopColor={scrim} stopOpacity={1} />
                <Stop offset={to} stopColor={scrim} stopOpacity={0} />
              </SvgLinearGradient>
            </Defs>
            <Rect x="0" y="0" width={box.w} height={box.h} fill={`url(#${gradientId})`} />
          </Svg>
        </>
      )}
    </View>
  );
}

export default function Roles() {
  const router = useRouter();
  const { refresh } = useSessionContext();
  const { palette, accent, type } = useTheme();
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams();
  // Reached as /(auth)/roles?apply=1 after a social sign-in, where there is no
  // signup form to forward to and the account already exists. The email path
  // still forwards, because the form has to be filled before modes can be set.
  const applyDirectly = params.apply === '1';
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const choose = async (): Promise<void> => {
    if (!applyDirectly) {
      router.push('/(auth)/signup?client=1');
      return;
    }
    if (applying) return;
    setApplyError(null);
    setApplying(true);
    try {
      // V9 B1 (final review #1): refresh the session before leaving, or the tab gate reads the old `me`
      // and sends the user back here.
      await completeRoleStep({ client: true, repairer: false }, { applyModes, refresh });
      // applyModes stamps Profile.onboardingCompletedAt as an existing side
      // effect of PATCH /users/me/modes, so this screen cannot re-appear on a
      // successful mode application. If it FAILS the stamp is not written. The
      // failed account stays client-only until an explicit sign-out (sessions last
      // 60 days and app/index.tsx sends any session-holder straight to /(tabs)),
      // though it is recoverable via Profil's mode switch.
      // `enterSignedInApp` (CF4-47) so the auth screens below this one go too.
      enterSignedInApp(router, '/(tabs)');
    } catch (e) {
      // applyModes documents that its failures return French messages in
      // ApiError.message (see apply-modes.ts:11), so preserve them rather than
      // replacing them with a generic retry line. Enabling réparateur mode no
      // longer requires identity (CF4-01), but the server still answers in French
      // for the refusals that remain (e.g. a suspended réparateur).
      setApplyError(e instanceof ApiError ? e.message : 'Impossible d\'enregistrer votre choix. Veuillez réessayer.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: palette.paper }]}
      contentContainerStyle={[styles.container, { paddingTop: 22 + insets.top }]}
    >
      <ScreenBlobs />

      <View style={styles.content}>
        <View style={styles.head}>
          <BrandWordmark height={26} />
          <Text style={[styles.title, { color: palette.ink }]}>
            <Text style={{ color: accent.accent }}>Choisissez</Text> votre expérience.
          </Text>
          <Text style={[styles.subtitle, { color: palette.muted }]}>
            Revime met en relation les particuliers et les réparateurs de confiance.
          </Text>
        </View>

        {applyError && (
          <View style={{ backgroundColor: palette.redSoft, borderColor: palette.red, borderWidth: 1.5, borderRadius: 14, padding: 16, marginBottom: 12 }}>
            <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13, lineHeight: 18, color: palette.redDeep }}>{applyError}</Text>
          </View>
        )}

        <View style={styles.cards}>
          {/* Client card */}
          <Pressable
            onPress={() => void choose()}
            disabled={applying}
            style={({ pressed }) => [
              styles.roleCard,
              styles.roleCardClient,
              { backgroundColor: palette.red, shadowColor: palette.red },
              { transform: [{ scale: pressed ? 0.985 : 1 }] },
            ]}
          >
            <CardArt
              source={CLIENT_ART}
              ratio={CLIENT_ART_RATIO}
              scrim={palette.red}
              gradientId="roleScrimClient"
              from={0.14}
              to={0.62}
            />
            <View style={styles.roleContent}>
              <Text style={styles.roleEyebrow}>Je suis client</Text>
              <Text style={styles.roleTitle}>
                Faire réparer{'\n'}un objet
              </Text>
              <Text style={styles.roleDesc}>Publiez, comparez, choisissez.</Text>
              <View style={styles.badges}>
                <View style={styles.badge}>
                  <IconShieldCheck size={10} color="#fff" strokeWidth={2.4} />
                  <Text style={styles.badgeText}>Paiement sécurisé</Text>
                </View>
                <View style={styles.badge}>
                  <IconVerified size={10} color="#fff" strokeWidth={2.4} />
                  <Text style={styles.badgeText}>Réparateurs vérifiés</Text>
                </View>
              </View>
            </View>
            {/* .role2--client .role2__go { background: var(--accent-deep) } */}
            <View style={[styles.roleGo, { backgroundColor: palette.redDeep }]}>
              <IconArrowRight size={20} color="#fff" strokeWidth={2.4} />
            </View>
          </Pressable>

          {/* Repairer card */}
          <Pressable
            onPress={() =>
              router.push(applyDirectly ? '/(auth)/type-reparateur?apply=1' : '/(auth)/type-reparateur')
            }
            disabled={applying}
            style={({ pressed }) => [
              styles.roleCard,
              styles.roleCardRepairer,
              { backgroundColor: palette.navy, shadowColor: palette.navyDeep },
              { transform: [{ scale: pressed ? 0.985 : 1 }] },
            ]}
          >
            <CardArt
              source={REPAIRER_ART}
              ratio={REPAIRER_ART_RATIO}
              scrim={palette.navy}
              gradientId="roleScrimRepairer"
              from={0.34}
              to={1}
            />
            <View style={styles.roleContent}>
              <Text style={styles.roleEyebrow}>Je suis réparateur</Text>
              <Text style={styles.roleTitle}>
                Proposer mes{'\n'}réparations
              </Text>
              <Text style={styles.roleDesc}>Recevez des demandes, envoyez vos offres.</Text>
              <View style={styles.badges}>
                <View style={styles.badge}>
                  <IconPackage size={10} color="#fff" strokeWidth={2.4} />
                  <Text style={styles.badgeText}>Recevez des demandes</Text>
                </View>
                <View style={styles.badge}>
                  <IconShieldCheck size={10} color="#fff" strokeWidth={2.4} />
                  <Text style={styles.badgeText}>Paiement garanti</Text>
                </View>
              </View>
            </View>
            {/* .role2--client .role2__go { background: var(--accent-deep) }, mirrored
                here in navy so the two cards read the same shape. */}
            <View style={[styles.roleGo, { backgroundColor: palette.navyDeep }]}>
              <IconArrowRight size={20} color="#fff" strokeWidth={2.4} />
            </View>
          </Pressable>
        </View>

        <View style={styles.foot}>
          <View style={styles.trust}>
            <View style={styles.trustItem}>
              <IconShieldCheck size={14} color={accent.accent} strokeWidth={2.4} />
              <Text style={styles.trustText}>Paiement sécurisé</Text>
            </View>
            <View style={styles.trustItem}>
              <IconVerified size={14} color={accent.accent} strokeWidth={2.4} />
              <Text style={styles.trustText}>Réparateurs vérifiés</Text>
            </View>
          </View>
          <Text style={[styles.note, { color: palette.muted }]}>
            Un seul compte. Deux expériences.{'\n'}
            Passez du mode Client au mode Réparateur en un clic.
          </Text>
          {/**
           * CF-01. The client asked for this « en bas » of the role-choice screen.
           *
           * The OTHER half of CF-01 needs no code and was verified rather than
           * assumed: `login.tsx` validates email and password, signs in, and
           * replaces to `/(tabs)`. Nothing on that path reads a role or a mode, so
           * « se connecter directement sans avoir à choisir Client ou Réparateur »
           * is already true. What was missing was only this affordance - without
           * it a returning user had to come here, pick a role they do not need,
           * and find the link at the bottom of the SIGNUP form.
           */}
          <Text style={[styles.loginPrompt, { color: palette.muted }]}>
            Déjà inscrit ?{' '}
            <Text
              style={[styles.loginLink, { color: accent.accent }]}
              onPress={() => router.push('/(auth)/login')}
            >
              Se connecter
            </Text>
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  blobTopRight: {
    position: 'absolute',
    width: 200,
    height: 200,
    top: -60,
    right: -50,
    zIndex: 0,
  },
  blobBottomLeft: {
    position: 'absolute',
    width: 160,
    height: 160,
    bottom: -50,
    left: -40,
    zIndex: 0,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 26,
  },
  content: {
    flex: 1,
    zIndex: 2,
    gap: 16,
  },
  head: {
    gap: 8,
  },
  title: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 22,
    letterSpacing: -0.2,
    marginTop: 10,
  },
  subtitle: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  cards: {
    gap: 16,
  },
  roleCard: {
    position: 'relative',
    minHeight: 168,
    borderRadius: 24,
    padding: 20,
  },
  roleCardClient: {
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 30,
    elevation: 14,
  },
  roleCardRepairer: {
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.32,
    shadowRadius: 30,
    elevation: 14,
  },
  // The prototype puts overflow:hidden on .role2 itself, but on iOS that sets
  // masksToBounds and would clip the card's coloured glow shadow. So the clip lives on
  // this inner layer and the shadow stays on the Pressable.
  artClip: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 24,
    overflow: 'hidden',
    zIndex: 0,
  },
  roleContent: {
    position: 'relative',
    zIndex: 1,
  },
  roleEyebrow: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  roleTitle: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 20,
    lineHeight: 22,
    color: '#fff',
    marginTop: 6,
    marginBottom: 4,
  },
  roleDesc: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 12,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  badgeText: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 9,
    color: '#fff',
  },
  roleGo: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    // box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  foot: {
    alignItems: 'center',
    gap: 8,
    marginTop: 'auto',
  },
  trust: {
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'center',
    marginBottom: 8,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trustText: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 12,
  },
  note: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  loginPrompt: {
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
  },
  loginLink: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
});
