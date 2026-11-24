import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { BrandWordmark } from '../BrandWordmark';
import { KeyboardAvoider } from '../KeyboardAvoider';

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Pinned at the bottom, as in the client's mockup: the button, then its hint. */
  footer: ReactNode;
  onSignOut: () => void;
  onDelete: () => void;
};

/**
 * V9 B1. The frame both completion screens share, drawn from the client's « Dernière étape » mockup
 * (`docs/client-feedback/v9/screenshots/B1-maquette-derniere-etape-cgu-apple.png`): the wordmark top
 * left, a left-aligned bold title and a muted line under it, the content, and the action pinned at
 * the bottom. « Se déconnecter » and « Supprimer mon compte » stay reachable on every step
 * (`FND9-018`: before this, a new account stuck before phone confirmation could not reach deletion).
 */
export function SignupStepFrame({ title, subtitle, children, footer, onSignOut, onDelete }: Props) {
  const { palette, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const link = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" style={styles.link}>
      <Text style={[styles.linkText, { color: palette.muted }]}>{label}</Text>
    </Pressable>
  );
  return (
    <KeyboardAvoider style={{ backgroundColor: palette.paper }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.lg }}
      >
        <BrandWordmark height={22} />
        <Text accessibilityRole="header" style={[styles.title, { color: palette.ink, marginTop: spacing.lg }]}>
          {title}
        </Text>
        {subtitle ? <Text style={[styles.subtitle, { color: palette.muted, marginTop: spacing.xs }]}>{subtitle}</Text> : null}
        <View style={{ marginTop: spacing.lg }}>{children}</View>
        <View style={{ flexGrow: 1 }} />
        <View style={{ paddingTop: spacing.lg, paddingBottom: insets.bottom + spacing.md }}>
          {footer}
          <View style={[styles.links, { marginTop: spacing.md }]}>
            {link('Se déconnecter', onSignOut)}
            {link('Supprimer mon compte', onDelete)}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoider>
  );
}

// Type follows the app's existing screens (Google Sans Flex). The title is short (« Dernière étape »,
// « Avant de continuer », « Choisissez votre nom d'utilisateur »); at 24/700 the longest wraps to two
// lines on a 375pt phone, left-aligned like the mockup.
const styles = StyleSheet.create({
  title: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 24, lineHeight: 30 },
  subtitle: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14, lineHeight: 20 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 24 },
  link: { paddingVertical: 4 },
  linkText: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13.5, textDecorationLine: 'underline' },
});
