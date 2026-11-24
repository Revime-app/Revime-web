import { StyleSheet, Text, View } from 'react-native';
import { SIGNUP_CONNECTED_WITH, SIGNUP_TERMS_HINT, SIGNUP_TERMS_SUBTITLE } from '@revime/shared';
import { useTheme } from '../../theme';
import { Button } from '../Button';
import { Checkbox } from '../Checkbox';
import { SignupStepFrame } from './SignupStepFrame';

type Props = {
  title: 'Dernière étape' | 'Avant de continuer';
  /** The provider for an Apple / Google account, else null (no « Connecté avec » row). */
  connectedWith: 'Apple' | 'Google' | null;
  cguChecked: boolean;
  privacyChecked: boolean;
  error: string | null;
  submitting: boolean;
  onToggleCgu: () => void;
  onTogglePrivacy: () => void;
  onOpenCgu: () => void;
  onOpenPrivacy: () => void;
  onSubmit: () => void;
  onSignOut: () => void;
  onDelete: () => void;
};

/**
 * V9 B1 (B1 (1), (2); `DEC9-05` (3)–(5)). The client's « Dernière étape » mockup: the provider row,
 * the two required boxes with their documents as links, « Continuer » enabled only once both are
 * ticked, and the hint under it. No marketing box. Stateless; the screen holds the ticks.
 */
export function TermsStepView(p: Props) {
  const { palette, accent, radii, spacing } = useTheme();
  const both = p.cguChecked && p.privacyChecked;
  const link = (label: string, onPress: () => void) => (
    <Text accessibilityRole="link" onPress={onPress} style={[styles.box, { color: accent.accent, textDecorationLine: 'underline' }]}>
      {label}
    </Text>
  );
  const divider = <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.line, marginVertical: spacing.sm }} />;
  return SignupStepFrame({
    title: p.title,
    subtitle: SIGNUP_TERMS_SUBTITLE,
    onSignOut: p.onSignOut,
    onDelete: p.onDelete,
    footer: (
      <View>
        <Button label="Continuer" onPress={p.onSubmit} disabled={!both} loading={p.submitting} />
        <Text style={[styles.hint, { color: palette.muted, marginTop: spacing.sm }]}>{SIGNUP_TERMS_HINT}</Text>
      </View>
    ),
    children: (
      <View>
        {p.connectedWith ? (
          <View style={[styles.row, { backgroundColor: palette.navySoft, borderRadius: radii.field, padding: spacing.md, marginBottom: spacing.lg }]}>
            <Text style={[styles.rowText, { color: palette.ink2 }]}>
              {`${SIGNUP_CONNECTED_WITH} `}
              <Text style={[styles.rowStrong, { color: palette.ink }]}>{p.connectedWith}</Text>
            </Text>
          </View>
        ) : null}
        <Checkbox checked={p.cguChecked} onPress={p.onToggleCgu} disabled={p.submitting}>
          <Text style={[styles.box, { color: palette.ink }]}>
            {"J'accepte les "}
            {link("Conditions générales d'utilisation", p.onOpenCgu)}
          </Text>
        </Checkbox>
        {divider}
        <Checkbox checked={p.privacyChecked} onPress={p.onTogglePrivacy} disabled={p.submitting}>
          <Text style={[styles.box, { color: palette.ink }]}>
            {"J'accepte la "}
            {link('Politique de confidentialité', p.onOpenPrivacy)}
          </Text>
        </Checkbox>
        {p.error ? <Text style={[styles.error, { color: palette.red, marginTop: spacing.md }]}>{p.error}</Text> : null}
      </View>
    ),
  });
}

// The mockup draws the provider row as a soft grey band and the two boxes as one list split by a
// hairline; the hint is small and centred under the button. Widths (PIL, shipped Google Sans Flex,
// 2026-11-19), against 327pt inside 24pt gutters on a 375pt iPhone SE: « Dernière étape » 175.8pt and
// « Avant de continuer » 225.2pt at 24/700 (one line); the CGU label 297.0pt at 14/400, at the edge of
// the ~297pt beside the 20pt box, so it may wrap to two lines as the mockup draws it; the privacy label
// 249.0pt (one line); the hint 276.5pt at 12/400 (one line).
const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  rowText: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13.5 },
  rowStrong: { fontFamily: 'GoogleSansFlex_600SemiBold' },
  box: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14, lineHeight: 20 },
  hint: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12, lineHeight: 16, textAlign: 'center' },
  error: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, lineHeight: 19 },
});
