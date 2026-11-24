import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from './ScreenHeader';
import type { LegalDocument } from '../lib/legal/types';
import { useTheme } from '../theme';

// The generator writes every bullet as '• ' followed by the text (scripts/extract_legal_docs.py).
const BULLET = /^•\s*/;

interface LegalDocumentScreenProps {
  document: LegalDocument;
  onBack: () => void;
  headerTitle?: string;
  footer?: ReactNode;
  /**
   * V7 D5 (U9b): drawn above the text when the dashboard has made a newer version active than the one
   * this build ships (`newerLegalVersionNotice`); `onOpen` opens that version's PDF.
   */
  notice?: { text: string; linkLabel: string; onOpen: () => void } | null;
}

/**
 * Reusable screen component for rendering any LegalDocument.
 * Supports hanging-indent bullets, explicit line-break preservation,
 * inline key label styling, and level 1 / level 2 heading hierarchy.
 */
export function LegalDocumentScreen({
  document,
  onBack,
  headerTitle,
  footer,
  notice,
}: LegalDocumentScreenProps) {
  const { palette, spacing, radii } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper }} edges={['top']}>
      <ScreenHeader title={headerTitle ?? document.title} onBack={onBack} />
      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: spacing.xxl,
        }}
      >
        {notice ? (
          <View style={{ backgroundColor: palette.navySoft, borderRadius: radii.field, padding: spacing.md, marginBottom: spacing.lg }}>
            <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', fontSize: 14, lineHeight: 20, color: palette.ink }}>{notice.text}</Text>
            <Pressable onPress={notice.onOpen} hitSlop={8} style={{ marginTop: spacing.xs }}>
              <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14, color: palette.ink, textDecorationLine: 'underline' }}>
                {notice.linkLabel}
              </Text>
            </Pressable>
          </View>
        ) : null}
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_700Bold',
            fontSize: 22,
            color: palette.ink,
            marginBottom: spacing.xs,
          }}
        >
          {document.title}
        </Text>
        {document.updated ? (
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: 13,
              color: palette.muted,
              marginBottom: spacing.xl,
            }}
          >
            {document.updated}
          </Text>
        ) : null}

        {document.sections.map((section, idx) => (
          <View key={idx} style={{ marginBottom: spacing.xl }}>
            {section.heading ? (
              <Text
                accessibilityRole="header"
                style={
                  section.level === 2
                    ? {
                        fontFamily: 'GoogleSansFlex_600SemiBold',
                        fontSize: 15,
                        color: palette.ink,
                        marginTop: spacing.sm,
                        marginBottom: spacing.xs,
                      }
                    : {
                        fontFamily: 'GoogleSansFlex_700Bold',
                        fontSize: 17,
                        color: palette.navy,
                        marginTop: spacing.md,
                        marginBottom: spacing.sm,
                      }
                }
              >
                {section.heading}
              </Text>
            ) : null}
            {section.body.map((paragraph, pIdx) => {
              if (BULLET.test(paragraph)) {
                return (
                  <View
                    key={pIdx}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      marginBottom: spacing.xs,
                      paddingLeft: spacing.xs,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: 'GoogleSansFlex_700Bold',
                        fontSize: 15,
                        lineHeight: 22,
                        color: palette.navy,
                        width: 16,
                      }}
                    >
                      •
                    </Text>
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: 'GoogleSansFlex_400Regular',
                        fontSize: 15,
                        lineHeight: 22,
                        color: palette.ink,
                      }}
                    >
                      {paragraph.replace(BULLET, '')}
                    </Text>
                  </View>
                );
              }

              if (paragraph.trim().endsWith(':') && paragraph.trim().length < 60) {
                return (
                  <Text
                    key={pIdx}
                    style={{
                      fontFamily: 'GoogleSansFlex_600SemiBold',
                      fontSize: 15,
                      lineHeight: 22,
                      color: palette.ink,
                      marginBottom: spacing.xs,
                    }}
                  >
                    {paragraph}
                  </Text>
                );
              }

              return (
                <Text
                  key={pIdx}
                  style={{
                    fontFamily: 'GoogleSansFlex_400Regular',
                    fontSize: 15,
                    lineHeight: 22,
                    color: palette.ink,
                    marginBottom: spacing.md,
                  }}
                >
                  {paragraph}
                </Text>
              );
            })}
          </View>
        ))}

        {footer}
      </ScrollView>
    </SafeAreaView>
  );
}
