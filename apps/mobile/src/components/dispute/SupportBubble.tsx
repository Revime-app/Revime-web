import React from 'react';
import { View, Text, StyleSheet, Image, Pressable } from 'react-native';
import { stripSupportPrefix, type DocumentDto } from '@revime/shared';
import { palette, radii, spacing } from '../../theme';
import { DocumentRow } from './DocumentRow';

export function SupportBubble({
  body,
  createdAt,
  photoUrl,
  document,
  onPressPhoto,
}: {
  body?: string | null;
  createdAt?: string;
  photoUrl?: string | null;
  document?: DocumentDto | null;
  onPressPhoto?: (url: string) => void;
}) {
  const cleanBody = body ? stripSupportPrefix(body) : '';

  const formatTime = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <View style={styles.outerContainer}>
      <View style={styles.bubble}>
        {/* Support Header with R avatar */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>R</Text>
          </View>
          <Text style={styles.headerTitle} numberOfLines={1}>
            REVIME — Support
          </Text>
          {createdAt ? (
            <Text style={styles.headerTime}>{formatTime(createdAt)}</Text>
          ) : null}
        </View>

        {/* Optional Photo */}
        {photoUrl ? (
          <Pressable
            onPress={() => onPressPhoto?.(photoUrl)}
            style={styles.photoContainer}
          >
            <Image
              source={{ uri: photoUrl }}
              style={styles.photo}
              resizeMode="cover"
            />
          </Pressable>
        ) : null}

        {/* Optional Document */}
        {document ? (
          <View style={styles.documentContainer}>
            <DocumentRow document={document} />
          </View>
        ) : null}

        {/* Body Text */}
        {cleanBody.length > 0 ? (
          <Text style={styles.bodyText}>{cleanBody}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    alignSelf: 'flex-start',
    maxWidth: '88%',
    marginVertical: spacing.xs,
  },
  bubble: {
    backgroundColor: palette.redSoft, // pink tint
    borderRadius: radii.card,
    borderTopLeftRadius: 4,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: '#fbd0d7',
    minWidth: 210,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: palette.red,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    flexShrink: 0,
  },
  avatarText: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 11,
    color: palette.paper,
    lineHeight: 13,
  },
  headerTitle: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 12,
    color: palette.redDeep,
    flex: 1,
    flexShrink: 1,
  },
  headerTime: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 10.5,
    color: palette.muted,
    marginLeft: spacing.xs,
    flexShrink: 0,
  },
  photoContainer: {
    marginBottom: spacing.xs,
    borderRadius: 8,
    overflow: 'hidden',
  },
  photo: {
    width: 220,
    height: 150,
    borderRadius: 8,
  },
  documentContainer: {
    marginBottom: spacing.xs,
  },
  bodyText: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 13.5,
    color: palette.ink,
    lineHeight: 19,
    flexWrap: 'wrap',
  },
});
