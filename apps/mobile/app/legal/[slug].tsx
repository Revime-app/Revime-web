import { useLocalSearchParams, router } from 'expo-router';
import { Linking, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { LegalDocumentScreen } from '../../src/components/LegalDocumentScreen';
import { LEGAL_DOCUMENTS } from '../../src/lib/legal';
import { useTheme } from '../../src/theme';
import { usePlatformStatus } from '../../src/lib/platform-status-context';
import { newerLegalVersionNotice } from '../../src/lib/legal-version-notice';

/**
 * Dynamic route for rendering any legal document by slug.
 * Slugs match entries in `LEGAL_DOCUMENTS` (e.g., 'cgu', 'mentions-legales', etc.)
 */
export default function LegalDocumentRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { palette, spacing } = useTheme();
  const status = usePlatformStatus();

  const entry = LEGAL_DOCUMENTS.find((d) => d.slug === slug);

  if (!entry) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper }} edges={['top']}>
        <ScreenHeader title="Document légal" onBack={() => router.back()} />
        <View style={{ padding: spacing.lg }}>
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: 15,
              color: palette.muted,
            }}
          >
            Document introuvable.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const document = entry.getDocument();

  // V7 D5 (U9b): a line pointing to a newer published version than the text this build ships.
  const newer = newerLegalVersionNotice(entry.slug, status);

  return (
    <LegalDocumentScreen
      document={document}
      headerTitle={entry.label}
      onBack={() => router.back()}
      notice={
        newer
          ? { text: newer.text, linkLabel: newer.linkLabel, onOpen: () => void Linking.openURL(`${process.env.EXPO_PUBLIC_API_URL}/api/v1${newer.path}`) }
          : null
      }
    />
  );
}
