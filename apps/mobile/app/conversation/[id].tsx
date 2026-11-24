import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  MESSAGE_BODY_MAX,
  REPORT_REASONS,
  REPORT_REASON_LABEL,
  delayLabel,
  hasWarranty,
  euros,
  type ReportReason,
} from '@revime/shared';
import { useTheme } from '../../src/theme';
import { Card } from '../../src/components/Card';
import { IconArrowRight, IconBack, IconCamera, IconCancel, IconChevronRight, IconDocument, IconMore } from '../../src/icons';
import * as DocumentPicker from 'expo-document-picker';
import { ApiError } from '../../src/lib/api';
import { RevimeLoader } from '../../src/components/lottie/RevimeLoader';
import { imagePicker, isImagePickerAvailable } from '../../src/lib/image-picker';
import { uploadChatPhoto, uploadChatAttachment } from '../../src/lib/photo-upload';
import { DisputeSpace } from '../../src/components/dispute/DisputeSpace';
import { SupportBubble } from '../../src/components/dispute/SupportBubble';
import { DocumentRow } from '../../src/components/dispute/DocumentRow';
import {
  useBlockUser,
  useConversation,
  useMarkRead,
  useReportConversation,
  useSendMessage,
  useUnblockUser,
} from '../../src/lib/queries';
import { useSessionContext } from '../../src/lib/session';
import { timeLabel } from '../../src/lib/when';
import { getTxBadge } from '../../src/components/conversation/conversation-tx';
import { KeyboardAvoider } from '../../src/components/KeyboardAvoider';

export default function Conversation() {
  const { palette, spacing, accent, radii } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 44 : 20);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 16);
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id ?? '';

  const { me } = useSessionContext();
  const messagingEnabled = me?.messagingEnabled ?? false;
  const thread = useConversation(id);
  const send = useSendMessage(id);
  const markRead = useMarkRead(id);
  const report = useReportConversation(id);
  const block = useBlockUser(id);
  const unblock = useUnblockUser(id);
  /**
   * One sheet, two views. `'reasons'` is a second step rather than a second Modal:
   * nesting Modals is a known source of platform-specific dismissal bugs, and there
   * is no in-repo precedent for it.
   */
  const [sheet, setSheet] = useState<'closed' | 'menu' | 'reasons'>('closed');

  const blocked = thread.data?.blocked ?? { active: false, byMe: false };
  const counterpartUserId = thread.data?.counterpartUserId ?? '';

  const onBlock = () => {
    setSheet('closed');
    setError(null);
    block.mutate(
      { userId: counterpartUserId },
      {
        onError: (e) =>
          setError(e instanceof ApiError ? e.message : "Le blocage n'a pas pu être enregistré."),
      },
    );
  };

  const onUnblock = () => {
    setSheet('closed');
    setError(null);
    unblock.mutate(counterpartUserId, {
      onError: (e) =>
        setError(e instanceof ApiError ? e.message : "Le déblocage n'a pas pu être enregistré."),
    });
  };

  const onReport = (reason: ReportReason) => {
    setSheet('closed');
    setError(null);
    setNotice(null);
    report.mutate(
      { reason },
      {
        // A report changes nothing on screen, so without a confirmation the tap looks
        // like it did nothing - the same finding P4's review raised about a form that
        // swallowed its own errors.
        onSuccess: () => setNotice('Votre signalement a été transmis à notre équipe.'),
        onError: (e) =>
          setError(e instanceof ApiError ? e.message : "Votre signalement n'a pas pu être envoyé."),
      },
    );
  };

  const [activeTab, setActiveTab] = useState<'conversation' | 'litige'>('conversation');
  const [text, setText] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState<{ uri: string; contentType: string } | null>(null);
  const [pendingDoc, setPendingDoc] = useState<{ uri: string; name: string; sizeBytes?: number } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const scroller = useRef<ScrollView>(null);
  const readSent = useRef(false);

  // Once per mount. A ref rather than state, for two reasons: it must not trigger a
  // render, and without the guard every refetch would fire another PATCH - and a
  // send invalidates this query, so that would be one write per message sent.
  useEffect(() => {
    if (readSent.current || !thread.data) return;
    readSent.current = true;
    markRead.mutate();
  }, [thread.data, markRead]);

  const trimmed = text.trim();
  // `!blocked.active` folded in here rather than only in the render, so a stale render
  // cannot fire a send the server will refuse.
  const canSend =
    messagingEnabled &&
    !blocked.active &&
    (trimmed.length > 0 || pendingPhoto !== null || pendingDoc !== null) &&
    !send.isPending &&
    !isUploading;

  const onPickPhoto = async () => {
    const picker = imagePicker();
    if (!picker) return;
    try {
      const result = await picker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 0.7,
        preferredAssetRepresentationMode:
          picker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];
      const contentType = asset.mimeType ?? 'image/jpeg';
      if (contentType !== 'image/jpeg' && contentType !== 'image/png') {
        setError('Format non supporté. Veuillez utiliser JPEG ou PNG.');
        return;
      }
      setError(null);
      setPendingDoc(null);
      setPendingPhoto({ uri: asset.uri, contentType });
    } catch {
      setError('Impossible de sélectionner la photo.');
    }
  };

  const onPickDoc = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const asset = res.assets[0]!;
      setError(null);
      setPendingPhoto(null);
      setPendingDoc({
        uri: asset.uri,
        name: asset.name.slice(0, 120),
        sizeBytes: asset.size,
      });
    } catch {
      setError('Impossible de sélectionner le document.');
    }
  };

  const onSend = async () => {
    if (!canSend) return;
    setError(null);

    let photoPath: string | undefined = undefined;
    let documentPath: string | undefined = undefined;
    if (pendingPhoto) {
      setIsUploading(true);
      try {
        photoPath = await uploadChatPhoto(id, pendingPhoto.uri, pendingPhoto.contentType);
      } catch (e) {
        setIsUploading(false);
        setError(e instanceof ApiError ? e.message : "Impossible d'envoyer la photo.");
        return;
      }
      setIsUploading(false);
    } else if (pendingDoc) {
      setIsUploading(true);
      try {
        documentPath = await uploadChatAttachment(id, pendingDoc.uri, 'application/pdf');
      } catch (e) {
        setIsUploading(false);
        setError(e instanceof ApiError ? e.message : "Impossible d'envoyer le document.");
        return;
      }
      setIsUploading(false);
    }

    send.mutate(
      {
        body: trimmed,
        ...(photoPath ? { photoPath } : {}),
        ...(documentPath
          ? {
              documentPath,
              documentName: pendingDoc?.name,
              documentSizeBytes: pendingDoc?.sizeBytes,
            }
          : {}),
      },
      {
        onSuccess: () => {
          setText('');
          setPendingPhoto(null);
          setPendingDoc(null);
          requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: true }));
        },
        // The flag's 422 and the rate limit's 429 both arrive here carrying authored
        // French. Swallowing them would leave the send button looking dead.
        onError: (e) =>
          setError(e instanceof ApiError ? e.message : "Votre message n'a pas pu être envoyé."),
      },
    );
  };

  const recap = thread.data?.offerRecap ?? null;
  const tx = thread.data?.transaction ?? null;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: palette.line }]}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Retour" hitSlop={8}>
          <IconBack size={22} color={palette.ink} strokeWidth={2.4} />
        </Pressable>
        <Text style={[styles.title, { color: palette.ink }]} numberOfLines={1}>
          {thread.data?.counterpartName ?? ''}
        </Text>
        <Pressable
          onPress={() => setSheet('menu')}
          accessibilityLabel="Options"
          hitSlop={8}
          // Only with a loaded thread: the sheet's two actions both need
          // counterpartUserId, and offering them before it arrives would be a button
          // that cannot work.
          disabled={!thread.data}
        >
          <IconMore size={20} color={thread.data ? palette.ink : palette.line} strokeWidth={2.2} />
        </Pressable>
      </View>

      {/* CF4-30/31. If an order dispute exists, show Conversation / Litige tabs */}
      {thread.data?.dispute && (
        <View
          style={[
            styles.tabBar,
            { borderBottomColor: palette.line, backgroundColor: palette.paper },
          ]}
        >
          <Pressable
            onPress={() => setActiveTab('conversation')}
            style={[
              styles.tabBtn,
              activeTab === 'conversation' && {
                borderBottomColor: accent.accent,
                borderBottomWidth: 2,
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    activeTab === 'conversation' ? accent.accent : palette.muted,
                  fontFamily:
                    activeTab === 'conversation'
                      ? 'GoogleSansFlex_600SemiBold'
                      : 'GoogleSansFlex_500Medium',
                },
              ]}
            >
              Conversation
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('litige')}
            style={[
              styles.tabBtn,
              activeTab === 'litige' && {
                borderBottomColor: palette.red,
                borderBottomWidth: 2,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text
                style={[
                  styles.tabText,
                  {
                    color: activeTab === 'litige' ? palette.red : palette.muted,
                    fontFamily:
                      activeTab === 'litige'
                        ? 'GoogleSansFlex_600SemiBold'
                        : 'GoogleSansFlex_500Medium',
                  },
                ]}
              >
                Litige
              </Text>
              {thread.data.dispute.unread && (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: palette.red,
                  }}
                />
              )}
            </View>
          </Pressable>
        </View>
      )}

      {thread.data?.dispute && activeTab === 'litige' ? (
        <DisputeSpace
          commandeId={thread.data.dispute.commandeId}
          counterpartName={thread.data.counterpartName}
          counterpartRole={thread.data.counterpartIsRepairer ? 'repairer' : 'client'}
        />
      ) : (
        <KeyboardAvoider style={styles.avoid}>
        {tx ? (
          <View
            style={{
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.xs,
              paddingBottom: spacing.xs,
            }}
          >
            <Pressable
              onPress={() => router.push(`/commande/${tx.commandeId}`)}
              accessibilityRole="button"
              accessibilityLabel="Voir les détails de la transaction"
              style={({ pressed }) => [
                styles.txCard,
                {
                  backgroundColor: palette.paper,
                  borderColor: palette.line,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <View style={styles.txHeader}>
                <Text style={[styles.txOrderNum, { color: palette.muted }]}>
                  {/* `orderNumber` already carries the « # » (`orderNumberFor` → `#CMD-…`); a second
                      one here drew « ##CMD-… » (CF4-49). */}
                  {tx.orderNumber || 'COMMANDE'}
                </Text>
                {(() => {
                  const badge = getTxBadge(tx);
                  return (
                    <View style={[styles.txBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.txBadgeText, { color: badge.color }]}>
                        {badge.label}
                      </Text>
                    </View>
                  );
                })()}
              </View>

              <View style={styles.txBody}>
                <Text style={[styles.txTitle, { color: palette.ink }]} numberOfLines={1}>
                  {tx.title}
                </Text>
                <Text style={[styles.txAmount, { color: palette.ink }]}>
                  {euros(tx.totalCents)}
                </Text>
              </View>

              <View style={styles.txFooter}>
                <Text style={[styles.txActionText, { color: accent.accent }]}>
                  Voir les détails de la transaction
                </Text>
                <IconChevronRight size={15} color={accent.accent} strokeWidth={2.2} />
              </View>
            </Pressable>
          </View>
        ) : null}

        <ScrollView
          ref={scroller}
          contentContainerStyle={{ padding: spacing.lg }}
          // Without this the first tap on send is eaten dismissing the keyboard.
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
        >
          {thread.isPending && (
            <View style={{ paddingVertical: 48, alignItems: 'center', justifyContent: 'center' }}>
              <RevimeLoader variant="fill" size={72} />
            </View>
          )}

          {thread.isError && (
            <Card>
              <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink }}>
                Impossible de charger cette conversation
              </Text>
              <Text
                style={{
                  fontFamily: 'GoogleSansFlex_400Regular',
                  fontSize: 13,
                  color: palette.muted,
                  marginTop: 4,
                }}
              >
                Revenez en arrière puis réessayez.
              </Text>
            </Card>
          )}

          {/* Mirrors the prototype's own `convo.offerRecap &&` guard. Null is
              reachable and correct: he may have withdrawn every offer. */}
          {recap && !tx && (
            <View style={{ marginBottom: spacing.md }}>
              <Card>
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_700Bold',
                    fontSize: 10.5,
                    color: accent.accent,
                    letterSpacing: 0.6,
                  }}
                >
                  OFFRE CONCERNÉE
                </Text>
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_700Bold',
                    fontSize: 14,
                    color: palette.ink,
                    marginTop: 2,
                  }}
                  numberOfLines={2}
                >
                  {recap.object}
                </Text>
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_400Regular',
                    fontSize: 12,
                    color: palette.muted,
                    marginTop: 4,
                  }}
                >
                  {/* CF-31: same drop-out as the offer card and the payment summary. The
                      recap is built by `conversations.service.ts`'s own query rather than
                      by `OffersService.present`, so it needed the suppression wiring
                      separately - see that method's comment. */}
                  {euros(recap.priceCents)} · sous {delayLabel(recap.delayHours)}
                  {hasWarranty(recap.warrantyLabel) ? ` · Garantie ${recap.warrantyLabel}` : ''}
                </Text>
              </Card>
              <Text
                style={{
                  fontFamily: 'GoogleSansFlex_400Regular',
                  fontSize: 11.5,
                  color: palette.muted,
                  textAlign: 'center',
                  marginTop: spacing.xs,
                }}
              >
                Vous discutez de cette offre. Vos échanges sont sécurisés.
              </Text>
            </View>
          )}

          <View style={{ gap: spacing.sm }}>
            {(thread.data?.messages ?? []).map((m) =>
              m.kind === 'SYSTEM' ? (
                <View
                  key={m.id}
                  style={{ alignSelf: 'stretch', paddingVertical: spacing.xs, alignItems: 'center' }}
                >
                  <View
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 14,
                      backgroundColor: palette.paper,
                      borderWidth: 1,
                      borderColor: palette.line,
                      maxWidth: '90%',
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: 'GoogleSansFlex_500Medium',
                        fontSize: 12,
                        color: palette.muted,
                        textAlign: 'center',
                      }}
                    >
                      {m.body}
                    </Text>
                  </View>
                </View>
              ) : m.kind === 'SUPPORT' ? (
                <SupportBubble
                  key={m.id}
                  body={m.body}
                  createdAt={m.createdAt}
                  photoUrl={m.photoUrl}
                  document={m.document}
                  onPressPhoto={(url) => setViewingPhotoUrl(url)}
                />
              ) : (
                <View
                  key={m.id}
                  style={[
                    styles.bubble,
                    {
                      borderRadius: radii.card,
                      alignSelf: m.mine ? 'flex-end' : 'flex-start',
                      backgroundColor: m.mine ? accent.accent : palette.mist,
                    },
                  ]}
                >
                  {m.photoUrl ? (
                    <Pressable
                      onPress={() => setViewingPhotoUrl(m.photoUrl ?? null)}
                      style={{ marginBottom: m.body && m.body.trim().length > 0 ? 6 : 2 }}
                    >
                      <Image
                        source={{ uri: m.photoUrl }}
                        style={styles.bubbleImage}
                        resizeMode="cover"
                      />
                    </Pressable>
                  ) : null}
                  {m.document ? (
                    <View style={{ marginBottom: m.body && m.body.trim().length > 0 ? 6 : 2 }}>
                      <DocumentRow document={m.document} />
                    </View>
                  ) : null}
                  {m.body && m.body.trim().length > 0 ? (
                    <Text
                      style={{
                        fontFamily: 'GoogleSansFlex_400Regular',
                        fontSize: 13.5,
                        color: m.mine ? palette.paper : palette.ink,
                      }}
                    >
                      {m.body}
                    </Text>
                  ) : null}
                  <Text
                    style={{
                      fontFamily: 'GoogleSansFlex_400Regular',
                      fontSize: 10.5,
                      // Same two colours as the body, muted. A single grey would be
                      // unreadable on the accent bubble.
                      color: m.mine ? palette.paper : palette.muted,
                      opacity: m.mine ? 0.75 : 1,
                      alignSelf: 'flex-end',
                      marginTop: 2,
                    }}
                  >
                    {timeLabel(m.createdAt)}
                  </Text>
                </View>
              ),
            )}
          </View>
        </ScrollView>

        {error && (
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: 12.5,
              color: palette.red,
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.xs,
            }}
          >
            {error}
          </Text>
        )}

        {notice && (
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: 12.5,
              color: palette.muted,
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.xs,
            }}
          >
            {notice}
          </Text>
        )}

        {blocked.active ? (
          <View
            style={[
              styles.composer,
              { borderTopColor: palette.line, backgroundColor: palette.paper },
            ]}
          >
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 12.5,
                color: palette.muted,
                textAlign: 'center',
                flex: 1,
              }}
            >
              {blocked.byMe
                ? 'Vous avez bloqué cette personne.'
                : 'Vous ne pouvez plus échanger avec cette personne.'}
            </Text>
            {/* Only the blocker can unblock, and only he is told who acted. The other
                party's sentence is true without disclosing that he was blocked. */}
            {blocked.byMe && (
              <Pressable onPress={onUnblock} disabled={unblock.isPending} hitSlop={8}>
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_600SemiBold',
                    fontSize: 12.5,
                    color: unblock.isPending ? palette.muted : accent.accent,
                  }}
                >
                  Débloquer
                </Text>
              </Pressable>
            )}
          </View>
        ) : !messagingEnabled ? (
          <View style={[styles.composer, { borderTopColor: palette.line, backgroundColor: palette.paper }]}>
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 12.5,
                color: palette.muted,
                textAlign: 'center',
                flex: 1,
              }}
            >
              La messagerie arrive bientôt. Vous pouvez relire vos échanges.
            </Text>
          </View>
        ) : (
          <>
            {pendingPhoto && (
              <View
                style={[
                  styles.pendingBar,
                  { borderTopColor: palette.line, backgroundColor: palette.paper },
                ]}
              >
                <View style={styles.thumbnailBox}>
                  <Image source={{ uri: pendingPhoto.uri }} style={styles.thumbnailImg} resizeMode="cover" />
                  <Pressable
                    onPress={() => setPendingPhoto(null)}
                    style={styles.removePhotoBtn}
                    hitSlop={8}
                    accessibilityLabel="Supprimer la photo"
                  >
                    <IconCancel size={12} color="#FFFFFF" strokeWidth={2.4} />
                  </Pressable>
                </View>
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_400Regular',
                    fontSize: 12,
                    color: palette.muted,
                    flex: 1,
                  }}
                >
                  Photo prête à être envoyée
                </Text>
              </View>
            )}
            {pendingDoc && (
              <View
                style={[
                  styles.pendingBar,
                  { borderTopColor: palette.line, backgroundColor: palette.paper },
                ]}
              >
                <View style={styles.thumbnailBox}>
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 8,
                      backgroundColor: palette.mist,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <IconDocument size={24} color={palette.ink} strokeWidth={1.8} />
                  </View>
                  <Pressable
                    onPress={() => setPendingDoc(null)}
                    style={styles.removePhotoBtn}
                    hitSlop={8}
                    accessibilityLabel="Supprimer le document"
                  >
                    <IconCancel size={12} color="#FFFFFF" strokeWidth={2.4} />
                  </Pressable>
                </View>
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_400Regular',
                    fontSize: 12,
                    color: palette.ink,
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {pendingDoc.name}
                </Text>
              </View>
            )}
            <View
              style={[
                styles.composer,
                { borderTopColor: palette.line, backgroundColor: palette.paper },
              ]}
            >
              {isImagePickerAvailable() && (
                <Pressable
                  onPress={onPickPhoto}
                  disabled={!messagingEnabled || blocked.active || isUploading || send.isPending}
                  accessibilityLabel="Ajouter une photo"
                  style={[
                    styles.attachButton,
                    { backgroundColor: palette.mist, borderRadius: radii.pill },
                  ]}
                  hitSlop={4}
                >
                  <IconCamera size={20} color={palette.ink} strokeWidth={1.8} />
                </Pressable>
              )}
              <Pressable
                onPress={onPickDoc}
                disabled={!messagingEnabled || blocked.active || isUploading || send.isPending}
                accessibilityLabel="Ajouter un document"
                style={[
                  styles.attachButton,
                  { backgroundColor: palette.mist, borderRadius: radii.pill },
                ]}
                hitSlop={4}
              >
                {/* Same glyph size, colour and stroke as the camera button beside it (CF4-49). */}
                <IconDocument size={20} color={palette.ink} strokeWidth={1.8} />
              </Pressable>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: palette.mist, color: palette.ink },
                ]}
                placeholder="Votre message…"
                placeholderTextColor={palette.muted}
                value={text}
                onChangeText={setText}
                multiline
                // Reused from the shared schema so the two caps cannot drift.
                maxLength={MESSAGE_BODY_MAX}
              />
              <Pressable
                onPress={onSend}
                disabled={!canSend}
                accessibilityLabel="Envoyer"
                style={[
                  styles.send,
                  {
                    borderRadius: radii.pill,
                    backgroundColor: canSend ? accent.accent : palette.line,
                  },
                ]}
              >
                {isUploading || send.isPending ? (
                  <ActivityIndicator size="small" color={palette.paper} />
                ) : (
                  <IconArrowRight size={18} color={palette.paper} strokeWidth={2.4} />
                )}
              </Pressable>
            </View>
          </>
        )}
      </KeyboardAvoider>
    )}

      <Modal
        visible={sheet !== 'closed'}
        transparent
        animationType="slide"
        onRequestClose={() => setSheet('closed')}
      >
        <Pressable style={styles.backdrop} onPress={() => setSheet('closed')}>
          <Pressable
            style={[styles.sheet, { backgroundColor: palette.paper }]}
            onPress={(e) => e.stopPropagation()}
          >
            {sheet === 'menu' ? (
              <>
                {/* THREE items now, for a client. « Voir le profil » returned with Stage
                    4b piece C, which built the screen it opens - Étape 5 §9 recorded that
                    it would. « Supprimer la conversation » is still out of scope
                    (spec §3.4), so this is three of the prototype's four rather than all
                    of them.
                    🛑 It renders only when the counterpart IS the réparateur. On a
                    réparateur's side the counterpart is the client, who has no
                    RepairerProfile, so the profile route would 404 - an affordance that
                    fails is this project's own anti-pattern just as much as one that does
                    nothing. `activeMode` cannot gate it: this inbox applies no mode
                    filter, so a réparateur sees threads in which he is the client. */}
                {thread.data?.counterpartIsRepairer && (
                  <Pressable
                    onPress={() => {
                      const demandeId = thread.data?.demandeId;
                      if (demandeId === undefined) return;
                      setSheet('closed');
                      // The thread knows the demande, and `recap` carries the offerId when
                      // he has a live or accepted offer. Both are passed, so the profile's
                      // bar offers « Contacter » - which returns to THIS thread, because
                      // getOrCreate is idempotent. That is the right destination, not a
                      // round trip to apologise for.
                      const qs = recap
                        ? `?demandeId=${demandeId}&offerId=${recap.offerId}`
                        : `?demandeId=${demandeId}`;
                      router.push(`/reparateur/${counterpartUserId}${qs}`);
                    }}
                  >
                    <Text style={[styles.sheetItem, { color: palette.ink }]}>
                      Voir le profil
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={blocked.byMe ? onUnblock : onBlock}
                  disabled={block.isPending || unblock.isPending}
                >
                  <Text style={[styles.sheetItem, { color: palette.ink }]}>
                    {blocked.byMe ? 'Débloquer' : 'Bloquer'}
                  </Text>
                </Pressable>
                <Pressable onPress={() => setSheet('reasons')}>
                  <Text style={[styles.sheetItem, { color: palette.ink }]}>Signaler</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_700Bold',
                    fontSize: 15,
                    color: palette.ink,
                    marginBottom: spacing.sm,
                  }}
                >
                  Pourquoi signalez-vous cette conversation ?
                </Text>
                {REPORT_REASONS.map((reason) => (
                  <Pressable
                    key={reason}
                    onPress={() => onReport(reason)}
                    disabled={report.isPending}
                  >
                    <Text style={[styles.sheetItem, { color: palette.ink }]}>
                      {REPORT_REASON_LABEL[reason]}
                    </Text>
                  </Pressable>
                ))}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={viewingPhotoUrl !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingPhotoUrl(null)}
        statusBarTranslucent
      >
        <View style={styles.viewerBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setViewingPhotoUrl(null)}
            accessibilityRole="button"
            accessibilityLabel="Fermer l'image"
          />
          <View
            style={[
              styles.viewerHeader,
              {
                paddingTop: topInset + 8,
              },
            ]}
            pointerEvents="box-none"
          >
            <Pressable
              onPress={() => setViewingPhotoUrl(null)}
              style={styles.viewerCloseBtn}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
            >
              <IconCancel size={20} color="#FFFFFF" strokeWidth={2.4} />
            </Pressable>
          </View>
          <View
            style={[
              styles.viewerContent,
              {
                paddingBottom: bottomInset + 16,
              },
            ]}
            pointerEvents="box-none"
          >
            {viewingPhotoUrl && (
              <Image
                source={{ uri: viewingPhotoUrl }}
                style={styles.viewerImage}
                resizeMode="contain"
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  avoid: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
  },
  title: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 18, flex: 1 },
  txCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 4,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  txHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  txOrderNum: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 11.5,
    letterSpacing: 0.5,
  },
  txBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  txBadgeText: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 10.5,
  },
  txBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  txTitle: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 14,
    flex: 1,
  },
  txAmount: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 14,
  },
  txFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
    paddingTop: 6,
    marginTop: 2,
  },
  txActionText: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 12,
  },
  bubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10 },
  bubbleImage: {
    width: 220,
    height: 165,
    borderRadius: 10,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
  },
  attachButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  thumbnailBox: {
    position: 'relative',
    width: 48,
    height: 48,
  },
  thumbnailImg: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(20, 20, 20, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    /**
     * CF4-48. HALF THE MIN HEIGHT, NOT `radii.pill`. At one line (42pt) this draws the same pill;
     * as the multiline field grows, 999 was clamped to half the SHORTER side and the background
     * became an ellipse, with the first and last lines of text spilling past its curve (the text
     * is not clipped to the radius). A fixed 21 keeps a rounded rectangle at any height.
     */
    borderRadius: 21,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    // Android centres multiline text vertically by default; iOS already starts at the top.
    textAlignVertical: 'top',
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 14,
  },
  send: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetItem: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 15, paddingVertical: 14 },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.94)',
  },
  viewerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingBottom: 10,
    zIndex: 10,
  },
  viewerCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(30, 30, 30, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  viewerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 14,
  },
});
