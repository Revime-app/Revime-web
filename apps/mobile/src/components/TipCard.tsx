import { View, Text, Image, Pressable, Linking, StyleSheet } from 'react-native';
import { httpsUrlOrNull } from '@revime/shared';
import { useTheme } from '../theme';
import { IconIdea } from '../icons';
import { useDailyTip } from '../lib/queries';

export function TipCard({ mode }: { mode: 'CLIENT' | 'REPAIRER' }) {
  const { palette, radii, spacing } = useTheme();
  
  // CF2-17 / CF6-17: the tip is whatever the admin dashboard holds, and nothing else. There is
  // deliberately NO built-in fallback sentence: it used to show when the API answered null, which
  // made it a tip the admin could neither see, edit nor delete. The baseline sentences now live in
  // the `Tip` table (migration `20261011030000_seed_baseline_tips`), so with every tip deleted or
  // disabled the card simply hides.
  const { data: tip, isLoading } = useDailyTip(mode);

  if (isLoading || !tip?.text) {
    return null;
  }

  // P23: the admin can attach an image and a link to a tip. The API already drops anything that is not
  // https; it is checked again here because this is the one place a tapped address leaves the app.
  const imageUrl = httpsUrlOrNull(tip.imageUrl);
  const linkUrl = httpsUrlOrNull(tip.linkUrl);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.navySoft,
          borderRadius: radii.card,
          borderCurve: 'continuous',
          marginTop: spacing.xl,
        },
      ]}
    >
      <View style={[styles.glyph, { backgroundColor: palette.paper }]}>
        <IconIdea size={20} color={palette.navy} strokeWidth={2.1} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: palette.ink }]}>Conseil du jour</Text>
        <Text style={[styles.body, { color: palette.muted }]}>{tip.text}</Text>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={[styles.image, { borderRadius: radii.card / 2 }]}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
            accessibilityLabel="Illustration du conseil"
          />
        ) : null}
        {linkUrl ? (
          <Pressable
            onPress={() => void Linking.openURL(linkUrl)}
            accessibilityRole="link"
            accessibilityLabel="En savoir plus sur ce conseil"
            hitSlop={8}
            style={styles.link}
          >
            <Text style={[styles.linkText, { color: palette.navy }]}>En savoir plus</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 16 },
  glyph: {
    width: 38,
    height: 38,
    borderRadius: 11,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 13.5 },
  body: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  // A remote image has no intrinsic size: both dimensions are explicit (see BrandWordmark).
  image: { width: '100%', height: 140, marginTop: 10 },
  link: { marginTop: 10, alignSelf: 'flex-start' },
  linkText: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 12.5, textDecorationLine: 'underline' },
});
