import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { Initials } from '../../src/components/Initials';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { useSessionContext } from '../../src/lib/session';
import { ApiError, api } from '../../src/lib/api';
import { imagePicker, isImagePickerAvailable } from '../../src/lib/image-picker';
import { uploadAvatar } from '../../src/lib/photo-upload';
import type { MeResponse } from '@revime/shared';

/**
 * `CF-23`, moved out of `profil-public/index.tsx` by `CF-49`: mockup `04` panel 2 draws every
 * checklist item as a CHEVRON, so each editor is a pushed screen rather than an inline card.
 * The handlers below are the originals, comments included - nothing about the upload changed.
 */
export default function ProfilPublicPhoto() {
  const { palette, spacing } = useTheme();
  const router = useRouter();
  const { me, refresh } = useSessionContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * `CF-23`. Pick a photo, upload the bytes, then commit the path.
   *
   * TWO steps against the server on purpose - `POST …/avatar/sign` + PUT, then
   * `PATCH …/avatar` - so an upload that lands and a profile that fails to save are
   * distinguishable rather than one opaque failure.
   *
   * 🛑 `preferredAssetRepresentationMode: Compatible` IS NOT OPTIONAL. iPhones shoot HEIC by
   * default, the bucket allows only JPEG and PNG, and `expo-image-picker` does not transcode -
   * without this every ordinary camera photo is refused. `quality` does not help; that switch runs
   * before any re-encode. The TS docs claim the default is `Automatic` while the native field
   * default is `.current` ("avoid transcoding"), and the code wins. See `PhotoPicker.tsx` for the
   * measurement.
   *
   * `allowsEditing` gives a crop step, which an avatar wants and a demande photo does not.
   * `aspect` is Android-only because on iOS the crop rectangle is always a square - so the pair
   * yields a square on both platforms rather than only on one.
   */
  const pickAvatar = async () => {
    // Defence in depth: the button is not rendered when the picker is unavailable. This stays
    // because the alternative to an early return is a TypeError on a null module.
    const picker = imagePicker();
    if (!picker || busy) return;

    setError(null);
    const result = await picker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      preferredAssetRepresentationMode:
        picker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset) return;
    const contentType = asset.mimeType;
    // The last resort rather than the expected path, now that iOS hands us JPEG: it catches a type
    // iOS declined to transcode. Refusing is still right, because uploading bytes under a lying
    // content-type header makes the bucket reject the MIME mismatch.
    if (contentType !== 'image/jpeg' && contentType !== 'image/png') {
      setError('Format non supporté. Utilisez une image JPEG ou PNG.');
      return;
    }

    setBusy(true);
    try {
      const path = await uploadAvatar(asset.uri, contentType);
      await api.patch<MeResponse>('/users/me/avatar', { path });
      await refresh();
    } catch (e) {
      // `fields.path` is what the service attaches to both a bad shape and a missing object, so a
      // server-authored French message lands here rather than a generic one.
      setError(
        e instanceof ApiError ? (e.fields?.path ?? e.message) : "La photo n'a pas pu être envoyée.",
      );
    } finally {
      setBusy(false);
    }
  };

  /** `path: null` clears the column and deletes the object. Same route as setting one. */
  const removeAvatar = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await api.patch<MeResponse>('/users/me/avatar', { path: null });
      await refresh();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "La photo n'a pas pu être supprimée.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!me) return null;

  /**
   * `CF-49`: This editor is ungated, deliberately. `avatarPath` is on `Profile` - the person,
   * not the mode - and renders in a client's messages, so a client-only account has somewhere
   * for it to appear. Gating this on `repairerEnabled` would hide the editor from users who
   * need it.
   *
   * The mirror-image decision (banniere.tsx and description.tsx are gated) is documented in
   * `banniere.tsx`.
   */
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenHeader title="Photo de profil" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Card>
          <View style={styles.avatarRow}>
            {/* `?? null` at entry, not `!== null` at each read: `avatarUrl` is a NEW DTO field and
                arrives `undefined` from an API older than the app. See `AGENTS.md`. */}
            <Initials name={me.name} uri={me.avatarUrl ?? null} size={72} />
            <View style={styles.avatarActions}>
              {isImagePickerAvailable() ? (
                <>
                  <Button
                    label={me.avatarUrl ? 'Changer la photo' : 'Ajouter une photo'}
                    onPress={pickAvatar}
                    loading={busy}
                  />
                  {me.avatarUrl ? (
                    <Button
                      label="Supprimer la photo"
                      variant="text"
                      onPress={removeAvatar}
                      disabled={busy}
                    />
                  ) : null}
                </>
              ) : (
                /* Says so plainly rather than rendering a button that cannot work. The native half
                   of `expo-image-picker` only exists in a binary built after it was added, and the
                   installed build predates it. */
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_400Regular',
                    fontSize: 12,
                    color: palette.muted,
                  }}
                >
                  L'ajout de photo sera disponible dans une prochaine version de l'application.
                </Text>
              )}
            </View>
          </View>

          {/* Switches on the mode rather than listing every surface, because the surfaces DIFFER:
              a client is in no annuaire and has no fiche publique, so the réparateur sentence
              would be a false claim about where their photo appears. `AGENTS.md`'s rule about
              prototype copy asserting facts about the world. */}
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: 12,
              color: palette.muted,
              marginTop: spacing.md,
            }}
          >
            {me.profile.repairerEnabled
              ? "Elle apparaît dans l'annuaire, sur votre fiche publique et dans vos messages."
              : "Elle apparaît dans vos messages, à côté de votre nom d'utilisateur."}
          </Text>

          {error !== null && (
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_500Medium',
                fontSize: 13,
                color: palette.red,
                marginTop: spacing.sm,
              }}
            >
              {error}
            </Text>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatarActions: { flex: 1, gap: 4 },
});
