import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme';
import { Button } from './Button';
import { IconTick } from '../icons';
import type { PayoutSheetContent } from '../lib/payout-sheet';

/**
 * V8 E1, mockup 4. The bottom sheet « Une dernière étape pour recevoir vos X »: a « € » disc, the reason, a row per
 * payout step (ticked when done), one button to the first missing step, « Plus tard », and « Paiement sécurisé par
 * Stripe ». Same Modal-and-scrim shape and the same a11y safeguards as `OfferGateSheet` (scrim and sheet
 * `accessible={false}`, `accessibilityViewIsModal`, `onRequestClose`). The « € » is a Text glyph: Google Sans Flex has
 * it (cmap gid 539, checked for V8 E1).
 */
export function PayoutSetupSheet({
  visible,
  content,
  onDismiss,
}: {
  visible: boolean;
  content: PayoutSheetContent;
  onDismiss: () => void;
}) {
  const { palette, accent, spacing, radii } = useTheme();
  const router = useRouter();

  const go = () => {
    if (!content.action) return;
    onDismiss();
    router.push(content.action.route);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss} accessibilityViewIsModal>
      <Pressable style={[styles.scrim, { backgroundColor: `${palette.ink}8C` }]} onPress={onDismiss} accessible={false}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: palette.paper,
              borderTopLeftRadius: radii.card,
              borderTopRightRadius: radii.card,
              padding: spacing.xl,
            },
          ]}
          onPress={() => {}}
          accessible={false}
        >
          <View style={[styles.badge, { backgroundColor: accent.accent, marginBottom: spacing.md }]}>
            <Text style={[styles.euro, { color: palette.paper }]}>€</Text>
          </View>
          <Text style={[styles.title, { color: palette.ink }]}>{content.title}</Text>
          <Text style={[styles.body, { color: palette.muted, marginTop: spacing.sm }]}>{content.body}</Text>

          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            {content.rows.map((row) => (
              <View key={row.label} style={[styles.row, { borderColor: palette.line }]}>
                {row.done ? (
                  <View style={[styles.tick, { backgroundColor: palette.greenSoft }]}>
                    <IconTick size={12} color={palette.greenDeep} strokeWidth={2.6} />
                  </View>
                ) : (
                  <View style={[styles.untick, { borderColor: palette.faint }]} />
                )}
                <Text style={[styles.rowText, { color: palette.ink }]}>{row.label}</Text>
              </View>
            ))}
          </View>

          {content.action !== null && (
            <View style={{ marginTop: spacing.lg }}>
              <Button label={content.action.label} onPress={go} />
            </View>
          )}
          <View style={{ marginTop: spacing.xs }}>
            <Button label="Plus tard" variant="text" onPress={onDismiss} />
          </View>
          <Text style={[styles.foot, { color: palette.faint, marginTop: spacing.xs }]}>Paiement sécurisé par Stripe</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%' },
  badge: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  euro: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 22 },
  title: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 19, lineHeight: 25 },
  body: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13.5, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14 },
  tick: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  untick: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5 },
  rowText: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 14, flex: 1 },
  foot: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12, textAlign: 'center' },
});
