import { Text, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { Card } from './Card';
import { IconTick } from '../icons';
import { useSessionContext } from '../lib/session';
import { useRepairerJourney } from '../lib/use-repairer-journey';

/**
 * V8 E1, mockup 6 (`DEC8-08` (11)). On Profil, once setup is complete, this confirmation takes the place of the
 * setup card (which then renders nothing): a green tick, « Configuration terminée » and what he can now do.
 * Permanent, no timer. Only in réparateur mode, the same gate as the card.
 */
export function SetupCompleteRow({ style }: { style?: StyleProp<ViewStyle> }) {
  const { palette } = useTheme();
  const { me } = useSessionContext();
  const { loading, journey } = useRepairerJourney();

  if (loading || !journey || !journey.complete) return null;
  if (me?.profile.activeMode !== 'REPAIRER') return null;

  return (
    <Card accessible accessibilityRole="summary" style={[styles.row, style]}>
      <View style={[styles.disc, { backgroundColor: palette.greenSoft }]}>
        <IconTick size={16} color={palette.greenDeep} strokeWidth={2.6} />
      </View>
      <View style={styles.texts}>
        <Text style={[styles.title, { color: palette.ink }]}>Configuration terminée</Text>
        <Text style={[styles.body, { color: palette.muted }]}>
          Vous pouvez envoyer des offres et recevoir vos paiements.
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  disc: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1 },
  title: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15 },
  body: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, lineHeight: 18, marginTop: 2 },
});
