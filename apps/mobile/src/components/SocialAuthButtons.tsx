import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button } from './Button';
import { GoogleMark } from './GoogleMark';
import { appleAuth, isAppleAuthAvailable } from '../lib/apple-auth';
import { signInWithApple, signInWithGoogle } from '../lib/social-sign-in';

type Props = {
  /** Called after a successful sign-in. The caller decides where to go next. */
  onSignedIn: () => void | Promise<void>;
  /** True while the host screen's own form is submitting. */
  disabled?: boolean;
};

/**
 * The social half of both auth screens, shared rather than duplicated.
 *
 * Before this existed, `handleGoogle` was the same function in login.tsx and
 * signup.tsx with different error setters, and adding Apple would have made it
 * four copies. One component owns both providers, the busy states and the
 * French error copy.
 *
 * LAYOUT: Apple first, then Google, then an « OU » rule, then the host screen's
 * form. Guideline 4.8 requires the privacy-preserving option as « an equivalent
 * option » -- comparable prominence and placement -- and Apple names
 * below-the-fold placement as a rejection cause. So the order and the position
 * above the form are a compliance constraint, not a preference.
 *
 * 🛑 THIS COMPONENT OWNS BOTH GATES, and it did not used to. Until 2026-08-21 the
 * host screens each held `EXPO_PUBLIC_GOOGLE_ENABLED === '1'` and hid the WHOLE
 * block with it, so **Google's readiness decided whether APPLE rendered** -- the
 * wrong way round, since Apple is the provider with no server credential to wait
 * for. That coupling was found the hard way: build 5 shipped with the Apple
 * native module, the capability and the entitlement all in place, and neither
 * button appeared because Google's OAuth client still did not exist.
 *
 * Each provider is now gated on its OWN prerequisite, with one deliberate link
 * kept: on iOS, Google never renders WITHOUT Apple beside it. That is guideline
 * 4.8 and it is a real rejection cause, so it stays as a hard rule in code rather
 * than as a note for whoever flips a flag next.
 */
export function SocialAuthButtons({ onSignedIn, disabled }: Props) {
  const { palette, radii } = useTheme();
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // TWO gates, and neither implies the other: the native half must be in this
  // binary (sync probe) AND the OS must support Apple auth (async, false on
  // Android and on iOS below 13).
  const [appleOsSupports, setAppleOsSupports] = useState(false);
  useEffect(() => {
    let alive = true;
    const mod = appleAuth();
    if (mod === null) return;
    void mod
      .isAvailableAsync()
      .then((available) => {
        if (alive) setAppleOsSupports(available);
      })
      .catch(() => {
        // Unavailable is the fail-safe answer; never surface this.
      });
    return () => {
      alive = false;
    };
  }, []);

  const showApple = isAppleAuthAvailable() && appleOsSupports;

  /**
   * Google's gate is a build-time flag because its credentials live on the server
   * and cannot be probed from here: `buildSocialProviders` registers Google only
   * when GOOGLE_CLIENT_ID *and* GOOGLE_CLIENT_SECRET are both set, and a missing
   * provider answers 404 PROVIDER_NOT_FOUND. So the flag's job is to stop us
   * rendering a button that would fail, and it must not go to "1" before those
   * two variables exist on Render.
   */
  const googleConfigured = process.env.EXPO_PUBLIC_GOOGLE_ENABLED === '1';

  /**
   * 🛑 The one coupling that is deliberate, and it runs the OPPOSITE way to the old
   * one: Apple gates Google, never the reverse. Guideline 4.8 requires an
   * equivalent privacy-preserving option, so offering Google alone on iOS is a
   * rejection cause. Android has no Apple sign-in at all, so the rule is scoped to
   * iOS rather than applied blindly.
   */
  const showGoogle = googleConfigured && (Platform.OS !== 'ios' || showApple);

  // Nothing to show means nothing to separate: rendering the « OU » rule with no
  // button above it leaves a divider floating over the form. The early return sits
  // after every hook, so the Apple probe still runs and can un-hide the block.
  if (!showApple && !showGoogle) return null;

  const run = async (provider: 'google' | 'apple') => {
    setError(null);
    setBusy(provider);
    try {
      const result = provider === 'google' ? await signInWithGoogle() : await signInWithApple();
      if (result.ok) {
        await onSignedIn();
        return;
      }
      // Cancellation says nothing. See SocialResult.
      if (!result.cancelled) setError(result.messageFr);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.wrap}>
      {error && (
        <View
          style={[
            styles.banner,
            { backgroundColor: palette.redSoft, borderColor: palette.red, borderRadius: radii.field },
          ]}
        >
          <Text style={[styles.bannerText, { color: palette.redDeep }]}>{error}</Text>
        </View>
      )}

      {showApple && <AppleButton onPress={() => void run('apple')} disabled={disabled || busy !== null} />}

      {showGoogle && (
        <Button
          label="Continuer avec Google"
          variant="secondary"
          icon={<GoogleMark />}
          onPress={() => void run('google')}
          loading={busy === 'google'}
          disabled={disabled || busy === 'apple'}
        />
      )}

      <View style={styles.divider}>
        <View style={[styles.rule, { backgroundColor: palette.line }]} />
        <Text style={[styles.dividerText, { color: palette.faint }]}>OU</Text>
        <View style={[styles.rule, { backgroundColor: palette.line }]} />
      </View>
    </View>
  );
}

/**
 * Apple's own button, via the native ASAuthorizationAppleIDButton wrapper, which
 * arrives already localized (so « Continuer avec Apple » costs us no string),
 * accessible, and compliant with Apple's branding rules. Drawing our own is what
 * Apple's model exists to prevent.
 *
 * Rendered through a child component so the module is only reached on a path
 * that has already probed it.
 */
function AppleButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  const { radii } = useTheme();
  const mod = appleAuth();
  if (mod === null) return null;
  const AppleAuthenticationButton = mod.AppleAuthenticationButton;

  return (
    <AppleAuthenticationButton
      buttonType={mod.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={mod.AppleAuthenticationButtonStyle.BLACK}
      // 🛑 cornerRadius is a PROP. Setting borderRadius (or backgroundColor)
      // through `style` fails silently -- the prop type omits both.
      cornerRadius={radii.field}
      // 🛑 BOTH dimensions are required or the button renders NOTHING. Same shape
      // as the aspectRatio-on-Image trap in AGENTS.md: the failure is invisible,
      // not wrong-looking.
      style={{ width: '100%', height: 52 }}
      onPress={disabled ? () => {} : onPress}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 9 },
  banner: { padding: 16, borderWidth: 1.5 },
  bannerText: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13, lineHeight: 18 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  rule: { flex: 1, height: 1 },
  dividerText: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 11, letterSpacing: 0.6 },
});
