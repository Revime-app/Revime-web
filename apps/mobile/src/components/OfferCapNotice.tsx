import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button } from './Button';
import type { OfferCapNoticeState } from '../lib/particular-quota-view';

type Props = {
  notice: OfferCapNoticeState;
  onOpenBusiness: () => void;
};

/**
 * V7 A10 (U7, `DEC7-22` Q5, Q7). The offer form's CGU art. 53 notice, drawn where « Envoyer mon
 * offre » sits. From 80 % it is one warning line above the button; at the cap it REPLACES the button
 * with the refusal and « Mon entreprise », so the form never offers a send the server will refuse.
 * The button lands on a screen that says yes: a capped individual has sent offers, so his identity is
 * verified and `entreprise.tsx` accepts him (the `CF-31` test in apps/mobile/AGENTS.md).
 */
export function OfferCapNotice({ notice, onOpenBusiness }: Props) {
  const { palette, radii, spacing } = useTheme();
  if (notice.kind === 'none') return null;

  if (notice.kind === 'warning') {
    return <Text style={[styles.text, { color: palette.amberDeep, marginBottom: spacing.sm }]}>{notice.text}</Text>;
  }

  return (
    <View style={[styles.blocked, { backgroundColor: palette.redSoft, borderRadius: radii.card, padding: spacing.md }]}>
      <Text style={[styles.text, { color: palette.redDeep }]}>{notice.text}</Text>
      <View style={{ marginTop: spacing.md }}>
        <Button label="Mon entreprise" onPress={onOpenBusiness} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  text: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, lineHeight: 19 },
  blocked: {},
});
