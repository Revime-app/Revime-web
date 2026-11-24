import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { QuoteRequestList } from '../src/components/QuoteRequestList';
import { useRepairerQuoteRequests } from '../src/lib/queries';
import { RevimeLoader } from '../src/components/lottie/RevimeLoader';
import { RevimeRefreshScrollView } from '../src/components/RevimeRefreshScrollView';

/**
 * CF4-25. « Demandes de devis » - every private request a client sent this réparateur, open
 * ones first (the server's order). Reached from the Tableau de bord section and its « À faire »
 * line, both réparateur-mode only, so this screen does not re-gate on mode.
 */
export default function DevisRecus() {
  const { palette, spacing } = useTheme();
  const router = useRouter();
  const requests = useRepairerQuoteRequests();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenHeader title="Demandes de devis" onBack={() => router.back()} />
      {requests.isPending ? (
        <View style={styles.loaderContainer}>
          <RevimeLoader variant="fill" size={72} />
        </View>
      ) : (
        <RevimeRefreshScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          onRefresh={() => requests.refetch()}
        >
          <QuoteRequestList
            items={requests.data}
            isPending={false}
            isError={requests.isError}
            onOpen={(id) => router.push(`/demande/${id}`)}
            emptyLabel="Aucune demande de devis pour le moment."
          />
        </RevimeRefreshScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
