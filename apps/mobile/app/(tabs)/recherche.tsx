import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';
import { ScreenMotif } from '../../src/components/ScreenMotif';
import { ClientSearch } from '../../src/components/ClientSearch';
import { DemandeFeed } from '../../src/components/DemandeFeed';
import { useSessionContext } from '../../src/lib/session';
import { useTourPage } from '../../src/tour/use-tour';

export default function Recherche() {
  const { palette } = useTheme();
  const { me } = useSessionContext();

  const activeMode = me?.profile.activeMode || 'CLIENT';
  // V8 E2: both modes' targets (the client's subtabs, the repairer's search field) render at once.
  useTourPage('recherche', true);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenMotif v={3} variant={activeMode === 'REPAIRER' ? 'navy' : 'accent'} />
      {activeMode === 'REPAIRER' ? (
        <DemandeFeed searchable />
      ) : (
        <ClientSearch />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
