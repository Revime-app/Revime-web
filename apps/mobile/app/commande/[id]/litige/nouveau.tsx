import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { DisputeMotif, DisputeSide } from '@revime/shared';
import { useTheme } from '../../../../src/theme';
import { ScreenHeader } from '../../../../src/components/ScreenHeader';
import { Button } from '../../../../src/components/Button';
import { MotifList } from '../../../../src/components/dispute/MotifList';
import {
  AttachmentPicker,
  type SelectedAttachment,
} from '../../../../src/components/dispute/AttachmentPicker';
import { useCommande, useOpenDispute } from '../../../../src/lib/queries';
import { ApiError } from '../../../../src/lib/api';
import { KeyboardAvoider } from '../../../../src/components/KeyboardAvoider';

export default function NouveauLitigeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const commandeId = id ?? '';
  const { palette, spacing, radii } = useTheme();
  const router = useRouter();

  const commande = useCommande(commandeId);
  const openDispute = useOpenDispute(commandeId);

  const [motif, setMotif] = useState<DisputeMotif | null>(null);
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<SelectedAttachment[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const viewerSide: DisputeSide =
    commande.data?.viewerRole === 'REPAIRER' ? 'REPAIRER' : 'CLIENT';

  const descTrimmed = description.trim();
  const isDescValid = descTrimmed.length >= 20 && descTrimmed.length <= 1000;
  const isUploading = attachments.some((a) => a.uploading);
  const hasUploadError = attachments.some((a) => Boolean(a.error));
  const canSubmit =
    motif !== null &&
    isDescValid &&
    !isUploading &&
    !hasUploadError &&
    !openDispute.isPending;

  const handleSubmit = async () => {
    if (!motif || !isDescValid || isUploading) return;
    setFormError(null);

    const validAttachments = attachments
      .filter((a) => !a.uploading && !a.error && a.path)
      .map((a) => ({
        kind: a.kind,
        path: a.path,
        name: a.name,
        sizeBytes: a.sizeBytes,
      }));

    openDispute.mutate(
      {
        motif,
        description: descTrimmed,
        attachments: validAttachments,
      },
      {
        onSuccess: (res) => {
          router.replace({
            pathname: '/commande/[id]/litige/ouvert',
            params: {
              id: commandeId,
              ref: res.reference,
            },
          });
        },
        onError: (err) => {
          if (err instanceof ApiError) {
            setFormError(err.message);
          } else {
            setFormError("Une erreur est survenue lors de l'ouverture du litige.");
          }
        },
      },
    );
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: palette.page }}
      edges={['top']}
    >
      <ScreenHeader
        title="Signaler un problème"
        onBack={() => router.back()}
      />
      <KeyboardAvoider>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { padding: spacing.lg, paddingBottom: spacing.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Warning card */}
          <View
            style={[
              styles.warningCard,
              {
                backgroundColor: '#fff5f5',
                borderColor: '#fed7d7',
                borderRadius: radii.card,
              },
            ]}
          >
            <Text style={styles.warningTitle}>⚠️ Attention</Text>
            <Text style={[styles.warningText, { color: palette.ink }]}>
              L'ouverture d'un litige suspend immédiatement les fonds et le
              paiement de la commande. REVIME interviendra pour arbitrer la
              situation.
            </Text>
          </View>

          {/* Motif selection */}
          <View style={{ marginTop: spacing.lg }}>
            <Text
              style={[
                styles.sectionTitle,
                { color: palette.ink, marginBottom: spacing.xs },
              ]}
            >
              Quel est le problème rencontré ?
            </Text>
            <MotifList
              side={viewerSide}
              selectedMotif={motif}
              onSelect={setMotif}
            />
          </View>

          {/* Description */}
          <View style={{ marginTop: spacing.xl }}>
            <Text style={[styles.sectionTitle, { color: palette.ink }]}>
              Description du problème
            </Text>
            <Text
              style={[
                styles.sectionSubtitle,
                { color: palette.muted, marginBottom: spacing.xs },
              ]}
            >
              Décrivez précisément la situation rencontrée.
            </Text>

            <TextInput
              style={[
                styles.textArea,
                {
                  backgroundColor: palette.paper,
                  borderColor:
                    description.length > 0 && !isDescValid
                      ? palette.red
                      : palette.line,
                  borderRadius: radii.card,
                  color: palette.ink,
                },
              ]}
              placeholder="Expliquez ce qui s'est passé en détail (20 à 1000 caractères)..."
              placeholderTextColor={palette.muted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              maxLength={1000}
            />

            <View style={styles.counterRow}>
              <Text
                style={[
                  styles.counterText,
                  {
                    color:
                      description.length > 0 && !isDescValid
                        ? palette.red
                        : palette.muted,
                  },
                ]}
              >
                {descTrimmed.length} / 1000 caractères (min. 20)
              </Text>
            </View>
          </View>

          {/* Attachments */}
          <View style={{ marginTop: spacing.lg }}>
            <Text style={[styles.sectionTitle, { color: palette.ink }]}>
              Photos ou documents (optionnel)
            </Text>
            <Text
              style={[
                styles.sectionSubtitle,
                { color: palette.muted, marginBottom: spacing.sm },
              ]}
            >
              Ajoutez jusqu'à 5 photos ou documents PDF pour appuyer votre
              signalement.
            </Text>

            <AttachmentPicker
              commandeId={commandeId}
              attachments={attachments}
              onChange={setAttachments}
              maxAttachments={5}
            />
          </View>

          {/* Server Error banner */}
          {formError ? (
            <View
              style={[
                styles.errorCard,
                {
                  backgroundColor: '#fef3f2',
                  borderColor: '#fecdca',
                  borderRadius: 8,
                  marginTop: spacing.md,
                },
              ]}
            >
              <Text style={[styles.errorCardText, { color: palette.red }]}>
                {formError}
              </Text>
            </View>
          ) : null}

          {/* Submit button */}
          <View style={{ marginTop: spacing.xl }}>
            <Button
              label="Envoyer le litige"
              variant="primary"
              disabled={!canSubmit}
              loading={openDispute.isPending}
              onPress={handleSubmit}
            />
          </View>
        </ScrollView>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
  warningCard: {
    padding: 14,
    borderWidth: 1,
  },
  warningTitle: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 14,
    color: '#b91c1c',
    marginBottom: 4,
  },
  warningText: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 13,
    lineHeight: 18,
  },
  sectionTitle: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 15,
  },
  sectionSubtitle: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 13,
    marginTop: 2,
  },
  textArea: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 14,
    padding: 12,
    borderWidth: 1,
    minHeight: 110,
    textAlignVertical: 'top',
  },
  counterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  counterText: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 11,
  },
  errorCard: {
    padding: 12,
    borderWidth: 1,
  },
  errorCardText: {
    fontFamily: 'GoogleSansFlex_500Medium',
    fontSize: 13,
    textAlign: 'center',
  },
});
