import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { useSessionContext } from '../../src/lib/session';
import { useConnectStatus } from '../../src/lib/queries';
import { useRepairerJourney } from '../../src/lib/use-repairer-journey';

export default function ConnectRetour() {
  const router = useRouter();
  const { palette, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const { me } = useSessionContext();

  const connectEnabled = me?.profile.repairerEnabled && me?.connectEnabled;
  const connectStatus = useConnectStatus(Boolean(connectEnabled));
  const { journey } = useRepairerJourney();

  useEffect(() => {
    if (connectEnabled) {
      void connectStatus.refetch();
    }
  }, []);

  const isVerified = connectStatus.data?.status === 'VERIFIED';

  return (
    <View style={[styles.screen, { backgroundColor: palette.paper, paddingTop: insets.top }]}>
      <View style={[styles.container, { paddingHorizontal: spacing.lg }]}>
        <Card>
          <Text style={[styles.heading, { color: palette.ink }]}>
            {isVerified ? 'Virements activés' : 'Informations envoyées'}
          </Text>
          {/* The verified body is a distinct line rather than the heading repeated,
              which read as an unfinished placeholder. */}
          <Text style={[styles.body, { color: palette.muted }]}>
            {isVerified
              ? 'Vos informations ont été validées. Vous pouvez désormais recevoir vos paiements sur votre compte bancaire.'
              : 'Stripe vérifie vos informations. Cela prend généralement quelques minutes.'}
          </Text>
          <Button
            label={journey?.complete === true ? 'Retour au profil' : 'Continuer'}
            onPress={() =>
              journey?.complete === true
                ? router.push('/(tabs)/profil')
                : router.replace('/statut-verification')
            }
          />
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 80,
  },
  heading: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 18,
    marginBottom: 12,
  },
  body: {
    fontSize: 13.5,
    lineHeight: 19.5,
    marginBottom: 16,
  },
});
