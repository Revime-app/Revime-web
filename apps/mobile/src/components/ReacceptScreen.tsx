import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { REACCEPT_CHECKBOX_LABEL, REACCEPT_TITLE, formatLegalVersionDate } from '@revime/shared';
import { useTheme } from '../theme';
import { BrandWordmark } from './BrandWordmark';
import { Button } from './Button';
import { Checkbox } from './Checkbox';

type Props = {
  version: string;
  /** The change summary typed at publish; nothing is drawn without one. */
  summary: string | null;
  accepted: boolean;
  submitting: boolean;
  error: string | null;
  onRead: () => void;
  onToggle: () => void;
  onAccept: () => void;
  onSignOut: () => void;
  onDelete: () => void;
};

/**
 * V7 D5 (U9b, `DEC7-24` Q12, `DEC7-25` Q1). Drawn by `MaintenanceGate` over the whole app while a
 * forced re-acceptance is owed. « Continuer » stays disabled until the box is ticked; « Se
 * déconnecter » and « Supprimer mon compte » are the two ways to refuse (Q11). Stateless: the gate
 * holds the tick, the request and its error.
 */
export function ReacceptScreen(p: Props) {
  const { palette, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const link = (label: string, onPress: () => void, tone: string) => (
    <Pressable onPress={onPress} hitSlop={10} style={styles.link}>
      <Text style={[styles.linkText, { color: tone }]}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: palette.paper, paddingTop: insets.top, paddingBottom: insets.bottom + spacing.md }]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, flexGrow: 1, justifyContent: 'center' }}>
        <View style={styles.center}>
          <BrandWordmark height={24} />
        </View>
        <Text style={[styles.title, { color: palette.ink, marginTop: spacing.lg }]}>{REACCEPT_TITLE}</Text>
        <Text style={[styles.meta, { color: palette.muted, marginTop: spacing.xs }]}>{`Version du ${formatLegalVersionDate(p.version)}`}</Text>
        {p.summary ? <Text style={[styles.body, { color: palette.ink2, marginTop: spacing.md }]}>{p.summary}</Text> : null}
        <View style={{ marginTop: spacing.md }}>{link('Lire les CGU', p.onRead, palette.ink)}</View>
        <View style={{ marginTop: spacing.lg }}>
          <Checkbox checked={p.accepted} onPress={p.onToggle}>
            <Text style={[styles.check, { color: palette.ink }]}>{REACCEPT_CHECKBOX_LABEL}</Text>
          </Checkbox>
        </View>
        {p.error ? <Text style={[styles.error, { color: palette.red, marginTop: spacing.sm }]}>{p.error}</Text> : null}
        <View style={{ marginTop: spacing.lg }}>
          <Button label="Continuer" onPress={p.onAccept} disabled={!p.accepted} loading={p.submitting} />
        </View>
        <View style={[styles.center, { marginTop: spacing.md }]}>
          {link('Se déconnecter', p.onSignOut, palette.muted)}
          <View style={{ height: spacing.sm }} />
          {link('Supprimer mon compte', p.onDelete, palette.muted)}
        </View>
      </ScrollView>
    </View>
  );
}

// Widths (PIL, shipped Google Sans Flex TTFs, 2026-10-30): the title is 356.5pt at 20/700 against the
// 327pt a 375pt phone leaves inside 24pt gutters, so it wraps to two centred lines, on purpose (18pt
// would fit with 6pt to spare and look cramped). The checkbox label wraps beside its box, as on the
// sign-up screen; the summary is free text (500 characters at most) and wraps.
const styles = StyleSheet.create({
  check: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13.5, lineHeight: 19 },
  root: { zIndex: 1000, elevation: 1000 },
  center: { alignItems: 'center' },
  title: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 20, lineHeight: 26, textAlign: 'center' },
  meta: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, textAlign: 'center' },
  body: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 15, lineHeight: 22 },
  error: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, lineHeight: 19 },
  link: { alignSelf: 'center', paddingVertical: 4 },
  linkText: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 14, textDecorationLine: 'underline' },
});
