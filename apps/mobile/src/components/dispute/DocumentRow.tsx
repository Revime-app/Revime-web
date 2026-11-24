import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { DocumentDto } from '@revime/shared';
import { palette, radii, spacing } from '../../theme';
import { IconDocument } from '../../icons';

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function DocumentRow({
  document,
  variant = 'bubble',
}: {
  document: DocumentDto;
  variant?: 'bubble' | 'standalone';
}) {
  const handlePress = async () => {
    if (document.url) {
      await WebBrowser.openBrowserAsync(document.url);
    }
  };

  const sizeText = formatFileSize(document.sizeBytes);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        variant === 'standalone' && styles.standalone,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir le document ${document.name}`}
    >
      <View style={styles.iconContainer}>
        <IconDocument size={18} color={palette.ink} strokeWidth={1.8} />
      </View>
      <View style={styles.infoContainer}>
        <Text style={styles.name} numberOfLines={1} ellipsizeMode="middle">
          {document.name}
        </Text>
        {sizeText ? <Text style={styles.size}>{sizeText}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xs,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    marginVertical: 2,
    maxWidth: '100%',
  },
  standalone: {
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.line,
    padding: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    fontFamily: 'GoogleSansFlex_500Medium',
    fontSize: 13,
    color: palette.ink,
  },
  size: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 11,
    color: palette.muted,
  },
});
