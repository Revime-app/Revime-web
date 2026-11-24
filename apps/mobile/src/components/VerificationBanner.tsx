import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme';
import { useSessionContext } from '../lib/session';

/**
 * The nudge.
 *
 * Renders only when the server says the gate is ON and the account has not
 * reached BASIC, so it self-retires on verification and stays invisible entirely
 * while the gate ships off. Keying it on `verificationRequired` rather than on the
 * level alone is what keeps it from promising a restriction the server is not
 * enforcing.
 *
 * Deliberately not blocking: the journey defers verification to the first action
 * that needs it, and this is what tells the user the wall exists before they meet
 * it mid-wizard.
 */
export function VerificationBanner() {
  const router = useRouter();
  const { palette, accent } = useTheme();
  const { me } = useSessionContext();

  if (!me || !me.verificationRequired || (me.emailVerified && me.phoneVerified)) return null;

  return (
    <Pressable
      onPress={() => router.push('/verification')}
      style={[styles.banner, { backgroundColor: accent.accentSoft, borderColor: accent.accent }]}
    >
      <Text style={[styles.text, { color: accent.accentDeep }]}>
        Confirmez votre adresse e-mail et votre numéro de mobile pour publier une demande ou envoyer une offre.
      </Text>
      <Text style={[styles.cta, { color: accent.accent }]}>Confirmer</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  text: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12.5, lineHeight: 17.4, flex: 1 },
  cta: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13 },
});
