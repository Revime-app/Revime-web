import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAINTENANCE_STAFF_BANNER, MAINTENANCE_TITLE } from '@revime/shared';
import { useTheme } from '../theme';
import { BrandWordmark } from './BrandWordmark';
import { Button } from './Button';

type Props = {
  /** The message typed in the dashboard's « Mode Maintenance » block. */
  message: string;
  onRetry: () => void;
  onTeamLogin: () => void;
};

/**
 * V7 D5 (U9, `DEC7-24` Q1, Q2). Drawn by `MaintenanceGate` over the whole app, tab bar included,
 * for everyone but the team. No time estimate: the setting has no end time. « Connexion équipe » is
 * deliberately small, a link and not a button, because it is for the team only.
 */
export function MaintenanceScreen({ message, onRetry, onTeamLogin }: Props) {
  const { palette, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.root,
        { backgroundColor: palette.paper, paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg, paddingHorizontal: spacing.lg },
      ]}
    >
      <View style={styles.body}>
        <BrandWordmark height={28} />
        <Text style={[styles.title, { color: palette.ink, marginTop: spacing.lg }]}>{MAINTENANCE_TITLE}</Text>
        <Text style={[styles.message, { color: palette.muted, marginTop: spacing.sm }]}>{message}</Text>
      </View>
      <Button label="Réessayer" onPress={onRetry} />
      <Pressable onPress={onTeamLogin} hitSlop={12} style={[styles.team, { marginTop: spacing.md }]}>
        <Text style={[styles.teamText, { color: palette.muted }]}>Connexion équipe</Text>
      </Pressable>
    </View>
  );
}

/**
 * V7 D5 (U9, Q5). A team member keeps full access during maintenance; this strip reminds him that
 * clients are blocked. Drawn above the navigator, which `MaintenanceGate` pushes down beneath it.
 */
export function MaintenanceStaffBanner() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.banner, { backgroundColor: palette.amberDeep, paddingTop: insets.top + 4 }]}>
      <Text style={[styles.bannerText, { color: palette.paper }]}>{MAINTENANCE_STAFF_BANNER}</Text>
    </View>
  );
}

// Widths (PIL, shipped Google Sans Flex TTFs, 2026-10-30): the title is 238.8pt at 22/700 in the 327pt a
// 375pt phone leaves inside 24pt gutters; the banner sentence is 277.5pt at 12/600 in 343pt. Both one
// line. The message is the dashboard's free text (500 characters at most) and wraps, centred.
const styles = StyleSheet.create({
  root: { zIndex: 1000, elevation: 1000 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 22, lineHeight: 28, textAlign: 'center' },
  message: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  team: { alignSelf: 'center', paddingVertical: 4 },
  teamText: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, textDecorationLine: 'underline' },
  banner: { paddingBottom: 6, paddingHorizontal: 16, alignItems: 'center' },
  bannerText: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 12, lineHeight: 16, textAlign: 'center' },
});
