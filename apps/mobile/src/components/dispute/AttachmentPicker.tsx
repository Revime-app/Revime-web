import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type { DisputeAttachmentInput } from '@revime/shared';
import { uploadDisputeAttachment } from '../../lib/photo-upload';
import { palette, radii, spacing } from '../../theme';
import { formatFileSize } from './DocumentRow';
import { IconCamera, IconCancel, IconDocument } from '../../icons';

export type SelectedAttachment = DisputeAttachmentInput & {
  id: string;
  localUri: string;
  uploading?: boolean;
  error?: string;
};

export function AttachmentPicker({
  commandeId,
  attachments,
  onChange,
  maxAttachments = 5,
}: {
  commandeId: string;
  attachments: SelectedAttachment[];
  onChange: (items: SelectedAttachment[]) => void;
  maxAttachments?: number;
}) {
  const [isPicking, setIsPicking] = useState(false);

  const canAddMore = attachments.length < maxAttachments;

  const handlePickPhoto = async () => {
    if (!canAddMore || isPicking) return;
    try {
      setIsPicking(true);
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;

      const remaining = maxAttachments - attachments.length;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsMultipleSelection: remaining > 1,
        selectionLimit: remaining,
      });

      if (res.canceled || !res.assets) return;

      const newPlaceholders: SelectedAttachment[] = res.assets.map((asset) => ({
        id: Math.random().toString(36).slice(2),
        kind: 'photo',
        path: '',
        localUri: asset.uri,
        uploading: true,
        sizeBytes: asset.fileSize,
      }));
      let current = [...attachments, ...newPlaceholders];
      onChange(current);

      for (let i = 0; i < res.assets.length; i++) {
        const asset = res.assets[i]!;
        const ph = newPlaceholders[i]!;
        const ext = asset.uri.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
        const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

        try {
          const path = await uploadDisputeAttachment(
            commandeId,
            asset.uri,
            contentType,
          );
          current = current.map((item) =>
            item.id === ph.id ? { ...item, path, uploading: false } : item,
          );
          onChange(current);
        } catch {
          current = current.map((item) =>
            item.id === ph.id
              ? {
                  ...item,
                  uploading: false,
                  error: "Échec de l'envoi de la photo.",
                }
              : item,
          );
          onChange(current);
        }
      }
    } catch {
      // Ignored
    } finally {
      setIsPicking(false);
    }
  };

  const handlePickDocument = async () => {
    if (!canAddMore || isPicking) return;
    try {
      setIsPicking(true);
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) return;

      const doc = res.assets[0]!;
      const id = Math.random().toString(36).slice(2);
      const placeholder: SelectedAttachment = {
        id,
        kind: 'document',
        path: '',
        name: doc.name.slice(0, 120),
        sizeBytes: doc.size,
        localUri: doc.uri,
        uploading: true,
      };

      const updated = [...attachments, placeholder];
      onChange(updated);

      try {
        const path = await uploadDisputeAttachment(
          commandeId,
          doc.uri,
          'application/pdf',
        );
        onChange(
          updated.map((item) =>
            item.id === id ? { ...item, path, uploading: false } : item,
          ),
        );
      } catch {
        onChange(
          updated.map((item) =>
            item.id === id
              ? {
                  ...item,
                  uploading: false,
                  error: "Échec de l'envoi du document.",
                }
              : item,
          ),
        );
      }
    } catch {
      // Ignored
    } finally {
      setIsPicking(false);
    }
  };

  const handleRemove = (id: string) => {
    onChange(attachments.filter((a) => a.id !== id));
  };

  return (
    <View style={styles.container}>
      {/* Pick buttons */}
      {canAddMore ? (
        <View style={styles.buttonsRow}>
          <Pressable
            onPress={handlePickPhoto}
            disabled={isPicking}
            style={({ pressed }) => [
              styles.pickButton,
              pressed && styles.pickButtonPressed,
            ]}
          >
            <IconCamera size={18} color={palette.ink} strokeWidth={1.8} />
            <Text style={styles.pickButtonText}>Ajouter une photo</Text>
          </Pressable>

          <Pressable
            onPress={handlePickDocument}
            disabled={isPicking}
            style={({ pressed }) => [
              styles.pickButton,
              pressed && styles.pickButtonPressed,
            ]}
          >
            <IconDocument size={18} color={palette.ink} strokeWidth={1.8} />
            <Text style={styles.pickButtonText}>Ajouter un PDF</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.limitText}>
          Limite de 5 pièces jointes atteinte.
        </Text>
      )}

      {/* Attachment previews */}
      {attachments.length > 0 ? (
        <View style={styles.itemsList}>
          {attachments.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              {item.kind === 'photo' ? (
                <Image
                  source={{ uri: item.localUri }}
                  style={styles.thumbnail}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.docIconBox}>
                  <IconDocument size={18} color={palette.ink} strokeWidth={1.8} />
                </View>
              )}

              <View style={styles.itemInfo}>
                <Text
                  style={styles.itemName}
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {item.name || (item.kind === 'photo' ? 'Photo' : 'Document PDF')}
                </Text>
                {item.uploading ? (
                  <Text style={styles.itemUploading}>Envoi en cours...</Text>
                ) : item.error ? (
                  <Text style={styles.itemError}>{item.error}</Text>
                ) : item.sizeBytes ? (
                  <Text style={styles.itemSize}>
                    {formatFileSize(item.sizeBytes)}
                  </Text>
                ) : null}
              </View>

              {item.uploading ? (
                <ActivityIndicator size="small" color={palette.red} />
              ) : (
                <Pressable
                  onPress={() => handleRemove(item.id)}
                  hitSlop={8}
                  style={styles.removeButton}
                >
                  <IconCancel size={16} color={palette.muted} strokeWidth={2} />
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pickButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: palette.mist,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
  },
  pickButtonPressed: {
    opacity: 0.7,
  },
  pickButtonText: {
    fontFamily: 'GoogleSansFlex_500Medium',
    fontSize: 13,
    color: palette.ink,
  },
  limitText: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 12,
    color: palette.muted,
  },
  itemsList: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xs,
    backgroundColor: palette.paper,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
  },
  thumbnail: {
    width: 36,
    height: 36,
    borderRadius: 4,
    backgroundColor: palette.mist,
  },
  docIconBox: {
    width: 36,
    height: 36,
    borderRadius: 4,
    backgroundColor: palette.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  itemName: {
    fontFamily: 'GoogleSansFlex_500Medium',
    fontSize: 13,
    color: palette.ink,
  },
  itemUploading: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 11,
    color: palette.muted,
  },
  itemError: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 11,
    color: palette.red,
  },
  itemSize: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 11,
    color: palette.muted,
  },
  removeButton: {
    padding: spacing.xs,
  },
});
