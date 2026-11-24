import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  formatDisputeRef,
  type DisputeMessageDto,
  type DisputeStatusType,
  type DocumentDto,
} from '@revime/shared';
import {
  useMarkDisputeRead,
  usePartyDispute,
  useSendDisputeMessage,
} from '../../lib/queries';
import { ApiError } from '../../lib/api';
import { uploadDisputeAttachment } from '../../lib/photo-upload';
import { palette, radii, spacing } from '../../theme';
import { RevimeLoader } from '../lottie/RevimeLoader';
import { SupportBubble } from './SupportBubble';
import { DocumentRow, formatFileSize } from './DocumentRow';
import { IconCamera, IconCancel, IconDocument } from '../../icons';
import { KeyboardAvoider } from '../KeyboardAvoider';

function formatDisputeStatus(status: DisputeStatusType): {
  label: string;
  bg: string;
  color: string;
} {
  switch (status) {
    case 'OPEN':
      return { label: 'Ouvert', bg: '#fef3f2', color: palette.red };
    case 'IN_REVIEW':
      return { label: "En cours d'examen", bg: palette.navySoft, color: palette.navy };
    case 'RESOLVED_REFUNDED':
      return { label: 'Résolu — Remboursé', bg: palette.greenSoft, color: palette.greenDeep };
    case 'RESOLVED_RELEASED':
      return { label: 'Résolu — Fonds libérés', bg: palette.greenSoft, color: palette.greenDeep };
    case 'RESOLVED_DISMISSED':
      return { label: 'Résolu — Rejeté', bg: palette.mist, color: palette.muted };
    default:
      return { label: status, bg: palette.mist, color: palette.muted };
  }
}

function formatDateSeparator(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

export function DisputeSpace({
  commandeId,
  counterpartName,
  counterpartRole,
}: {
  commandeId: string;
  counterpartName?: string;
  counterpartRole?: 'client' | 'repairer';
}) {
  const disputeQuery = usePartyDispute(commandeId);
  const markRead = useMarkDisputeRead(commandeId);
  const sendMessage = useSendDisputeMessage(commandeId);

  const [body, setBody] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<{
    uri: string;
    path: string;
  } | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<{
    uri: string;
    path: string;
    name: string;
    sizeBytes?: number;
  } | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const scrollViewRef = useRef<ScrollView>(null);

  // Mark read on mount / data load / screen focus
  useFocusEffect(
    useCallback(() => {
      markRead.mutate();
    }, [markRead]),
  );

  useEffect(() => {
    if (disputeQuery.data) {
      markRead.mutate();
    }
  }, [disputeQuery.data?.messages.length]);

  const dispute = disputeQuery.data;

  const otherSideLabel =
    counterpartName ||
    (counterpartRole === 'client' ? 'Le client' : 'Le réparateur');

  const handlePickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsMultipleSelection: false,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) return;

      const asset = res.assets[0]!;
      setSelectedDoc(null);
      setUploadingAttachment(true);
      setSendError(null);

      const ext = asset.uri.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
      const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const path = await uploadDisputeAttachment(
        commandeId,
        asset.uri,
        contentType,
      );
      setSelectedPhoto({ uri: asset.uri, path });
    } catch {
      setSendError("Échec de l'envoi de la photo.");
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handlePickDoc = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) return;

      const doc = res.assets[0]!;
      setSelectedPhoto(null);
      setUploadingAttachment(true);
      setSendError(null);

      const path = await uploadDisputeAttachment(
        commandeId,
        doc.uri,
        'application/pdf',
      );
      setSelectedDoc({
        uri: doc.uri,
        path,
        name: doc.name.slice(0, 120),
        sizeBytes: doc.size,
      });
    } catch {
      setSendError("Échec de l'envoi du document.");
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleSend = async () => {
    const trimmed = body.trim();
    const hasAttachment = Boolean(selectedPhoto || selectedDoc);
    if (!trimmed && !hasAttachment) return;

    setSendError(null);
    try {
      let attachmentPayload = undefined;
      if (selectedPhoto) {
        attachmentPayload = {
          kind: 'photo' as const,
          path: selectedPhoto.path,
        };
      } else if (selectedDoc) {
        attachmentPayload = {
          kind: 'document' as const,
          path: selectedDoc.path,
          name: selectedDoc.name,
          sizeBytes: selectedDoc.sizeBytes,
        };
      }

      await sendMessage.mutateAsync(
        attachmentPayload
          ? { body: trimmed, attachment: attachmentPayload }
          : { body: trimmed },
      );

      setBody('');
      setSelectedPhoto(null);
      setSelectedDoc(null);
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (e: any) {
      console.error('[DisputeSpace] Failed to send message:', e);
      setSendError(
        e instanceof ApiError
          ? e.message
          : "Impossible de joindre le serveur. Vérifiez votre connexion Internet.",
      );
    }
  };

  if (disputeQuery.isLoading) {
    return (
      <View style={styles.centerContainer}>
        <RevimeLoader variant="fill" size={72} />
      </View>
    );
  }

  if (disputeQuery.isError || !dispute) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>
          Impossible de charger le litige pour cette commande.
        </Text>
      </View>
    );
  }

  const statusInfo = formatDisputeStatus(dispute.status);

  // Group messages with date separators
  const messages = dispute.messages;
  let lastDateStr = '';

  return (
    <KeyboardAvoider style={styles.flex}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() =>
          scrollViewRef.current?.scrollToEnd({ animated: false })
        }
      >
        {/* Header reference + status badge */}
        <View style={styles.topBar}>
          <Text style={styles.disputeRefTitle}>
            Litige {formatDisputeRef(dispute.number)}
          </Text>
          <View
            style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}
          >
            <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}>
              {statusInfo.label}
            </Text>
          </View>
        </View>

        {/* Motif banner */}
        {dispute.motifLabel ? (
          <View style={styles.motifCard}>
            <Text style={styles.motifLabel}>Motif : {dispute.motifLabel}</Text>
          </View>
        ) : null}

        {/* Padlock privacy banner (mockup 10) */}
        <View style={styles.padlockBanner}>
          <Text style={styles.padlockIcon}>🔒</Text>
          <Text style={styles.padlockText}>
            Cet espace est privé. Vous échangez uniquement avec REVIME.{' '}
            {otherSideLabel} ne voit pas vos messages.
          </Text>
        </View>

        {/* Messages */}
        <View style={styles.messagesList}>
          {messages.map((m) => {
            const dateStr = formatDateSeparator(m.createdAt);
            const showDate = dateStr !== lastDateStr;
            if (showDate) lastDateStr = dateStr;

            return (
              <View key={m.id}>
                {showDate && (
                  <View style={styles.dateSeparator}>
                    <Text style={styles.dateSeparatorText}>{dateStr}</Text>
                  </View>
                )}

                {m.author === 'revime' ? (
                  <SupportBubble
                    body={m.body}
                    createdAt={m.createdAt}
                    photoUrl={m.photoUrl}
                    document={m.document}
                  />
                ) : (
                  <View style={styles.myBubbleContainer}>
                    <View style={styles.myBubble}>
                      {m.photoUrl ? (
                        <Image
                          source={{ uri: m.photoUrl }}
                          style={styles.bubblePhoto}
                          resizeMode="cover"
                        />
                      ) : null}

                      {m.document ? (
                        <View style={{ marginBottom: 4 }}>
                          <DocumentRow document={m.document} />
                        </View>
                      ) : null}

                      {m.body ? (
                        <Text style={styles.myBubbleText}>{m.body}</Text>
                      ) : null}

                      <Text style={styles.myBubbleTime}>
                        {formatTime(m.createdAt)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Composer or Closed Banner */}
      {dispute.canWrite ? (
        <View style={styles.composerWrapper}>
          {/* Selected attachment preview */}
          {selectedPhoto ? (
            <View style={styles.previewRow}>
              <Image
                source={{ uri: selectedPhoto.uri }}
                style={styles.previewThumb}
              />
              <Text style={styles.previewText} numberOfLines={1}>
                Photo prête à être envoyée
              </Text>
              <Pressable
                onPress={() => setSelectedPhoto(null)}
                style={styles.removePreviewBtn}
              >
                <IconCancel size={14} color={palette.muted} strokeWidth={2} />
              </Pressable>
            </View>
          ) : selectedDoc ? (
            <View style={styles.previewRow}>
              <View style={{ marginRight: 6 }}>
                <IconDocument size={18} color={palette.ink} strokeWidth={1.8} />
              </View>
              <Text style={styles.previewText} numberOfLines={1}>
                {selectedDoc.name}
              </Text>
              <Pressable
                onPress={() => setSelectedDoc(null)}
                style={styles.removePreviewBtn}
              >
                <IconCancel size={14} color={palette.muted} strokeWidth={2} />
              </Pressable>
            </View>
          ) : null}

          {sendError ? (
            <Text style={styles.sendErrorText}>{sendError}</Text>
          ) : null}

          <View style={styles.composerBar}>
            <Pressable
              onPress={handlePickPhoto}
              disabled={uploadingAttachment}
              style={styles.attachBtn}
            >
              <IconCamera size={20} color={palette.ink} strokeWidth={1.8} />
            </Pressable>

            <Pressable
              onPress={handlePickDoc}
              disabled={uploadingAttachment}
              style={styles.attachBtn}
            >
              <IconDocument size={20} color={palette.ink} strokeWidth={1.8} />
            </Pressable>

            <TextInput
              style={styles.input}
              placeholder="Écrivez à REVIME..."
              placeholderTextColor={palette.muted}
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={2000}
            />

            <Pressable
              onPress={handleSend}
              disabled={
                sendMessage.isPending ||
                uploadingAttachment ||
                (!body.trim() && !selectedPhoto && !selectedDoc)
              }
              style={({ pressed }) => [
                styles.sendBtn,
                (sendMessage.isPending ||
                  uploadingAttachment ||
                  (!body.trim() && !selectedPhoto && !selectedDoc)) &&
                  styles.sendBtnDisabled,
                pressed && styles.sendBtnPressed,
              ]}
            >
              {sendMessage.isPending || uploadingAttachment ? (
                <ActivityIndicator size="small" color={palette.paper} />
              ) : (
                <Text style={styles.sendBtnText}>Envoyer</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.closedBanner}>
          <Text style={styles.closedBannerText}>Ce litige est clos.</Text>
        </View>
      )}
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: palette.page,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  errorText: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 14,
    color: palette.red,
    textAlign: 'center',
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  disputeRefTitle: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 18,
    color: palette.ink,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 12,
  },
  motifCard: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: palette.paper,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    marginBottom: spacing.sm,
  },
  motifLabel: {
    fontFamily: 'GoogleSansFlex_500Medium',
    fontSize: 13,
    color: palette.muted,
  },
  padlockBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    backgroundColor: '#f5f7fa',
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: spacing.md,
  },
  padlockIcon: {
    fontSize: 16,
    marginRight: spacing.sm,
    marginTop: 2,
  },
  padlockText: {
    flex: 1,
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 12.5,
    color: palette.navy,
    lineHeight: 18,
  },
  messagesList: {
    gap: spacing.sm,
  },
  dateSeparator: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: palette.mist,
    marginVertical: spacing.sm,
  },
  dateSeparatorText: {
    fontFamily: 'GoogleSansFlex_500Medium',
    fontSize: 11,
    color: palette.muted,
  },
  myBubbleContainer: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    marginVertical: spacing.xs,
  },
  myBubble: {
    backgroundColor: palette.navy,
    borderRadius: radii.card,
    borderTopRightRadius: 4,
    padding: spacing.sm,
    minWidth: 60,
  },
  bubblePhoto: {
    width: 220,
    height: 150,
    borderRadius: 8,
    marginBottom: spacing.xs,
  },
  myBubbleText: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 13.5,
    color: palette.paper,
    lineHeight: 19,
  },
  myBubbleTime: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.7)',
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  composerWrapper: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
    backgroundColor: palette.paper,
    padding: spacing.sm,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xs,
    backgroundColor: palette.mist,
    borderRadius: 8,
    marginBottom: spacing.xs,
  },
  previewThumb: {
    width: 28,
    height: 28,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  previewText: {
    flex: 1,
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 12,
    color: palette.ink,
  },
  removePreviewBtn: {
    padding: spacing.xs,
  },
  sendErrorText: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 12,
    color: palette.red,
    marginBottom: spacing.xs,
  },
  composerBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  attachBtn: {
    padding: spacing.xs,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    height: 40,
    width: 36,
  },
  input: {
    flex: 1,
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 14,
    color: palette.ink,
    maxHeight: 100,
    minHeight: 40,
    backgroundColor: palette.mist,
    borderRadius: radii.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    textAlignVertical: 'top',
  },
  sendBtn: {
    backgroundColor: palette.red,
    borderRadius: radii.card,
    paddingHorizontal: spacing.md,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: palette.faint,
    opacity: 0.6,
  },
  sendBtnPressed: {
    opacity: 0.8,
  },
  sendBtnText: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 13,
    color: palette.paper,
  },
  closedBanner: {
    padding: spacing.md,
    backgroundColor: palette.mist,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  closedBannerText: {
    fontFamily: 'GoogleSansFlex_500Medium',
    fontSize: 13,
    color: palette.muted,
  },
});
