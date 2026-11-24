import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Card } from './Card';
import { Button } from './Button';
import type { QuotaCardView } from '../lib/particular-quota-view';

type Props = {
  view: QuotaCardView;
  onOpenBusiness: () => void;
};

/**
 * V7 A10 (U7, `DEC7-22` Q4, Q5, Q7). Profil's « PLAFOND PARTICULIER » card for a private individual
 * in Réparateur mode: CGU art. 53's two figures against their limits, the release date, a warning
 * from 80 % and, at the cap, the refusal and « Mon entreprise ». The same two bars as the
 * dashboard's « Compteur particulier ». Every string is built in `particular-quota-view.ts`.
 */
export function ParticularQuotaCard({ view, onOpenBusiness }: Props) {
  const { palette, spacing } = useTheme();
  const barColour = view.tone === 'blocked' ? palette.red : view.tone === 'warning' ? palette.amber : palette.navy;
  const noticeColour = view.tone === 'blocked' ? palette.redDeep : palette.amberDeep;

  const bar = (value: number) => (
    <View style={[styles.track, { backgroundColor: palette.line }]}>
      <View style={[styles.fill, { width: `${value}%`, backgroundColor: barColour }]} />
    </View>
  );

  return (
    <Card>
      <Text style={[styles.line, { color: palette.ink2 }]}>{view.missionsLine}</Text>
      {bar(view.missionsPercent)}
      <Text style={[styles.line, { color: palette.ink2, marginTop: spacing.sm }]}>{view.amountLine}</Text>
      {bar(view.amountPercent)}
      <Text style={[styles.release, { color: palette.muted, marginTop: spacing.sm }]}>{view.releaseLine}</Text>
      {view.notice && (
        <Text style={[styles.notice, { color: noticeColour, marginTop: spacing.sm }]}>{view.notice}</Text>
      )}
      {view.showBusinessButton && (
        <View style={{ marginTop: spacing.md }}>
          <Button label="Mon entreprise" onPress={onOpenBusiness} />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  line: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13.5 },
  track: { height: 8, borderRadius: 9999, overflow: 'hidden', marginTop: 6 },
  fill: { height: '100%', borderRadius: 9999 },
  release: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12.5, lineHeight: 18 },
  notice: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, lineHeight: 19 },
});
