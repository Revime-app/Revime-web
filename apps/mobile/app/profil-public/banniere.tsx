import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { useSessionContext } from '../../src/lib/session';
import { ApiError, api } from '../../src/lib/api';
import { imagePicker, isImagePickerAvailable } from '../../src/lib/image-picker';
import { uploadBanner } from '../../src/lib/photo-upload';
import type { MeResponse } from '@revime/shared';

/**
 * `CF-24`. The preview's height. Deliberately SHORTER than the fiche's own 120pt cover, because this
 * one sits inside a padded `Card` and is therefore narrower - 92 keeps roughly the fiche's 3:1 feel
 * at card width, so the crop he approves here is the crop a client gets.
 *
 * It is a preview and not a second rendering of the fiche: the fiche is one `router.push` away via
 * « Voir ma fiche » on the hub, which is the repo's standing answer to « show it twice ». What this
 * frame has to convey is only *which image is set and how it will be cropped*.
 */
const BANNER_PREVIEW_H = 92;

/**
 * `CF-24`, moved out of `profil-public/index.tsx` by `CF-49`: mockup `04` panel 2 draws every
 * checklist item as a CHEVRON, so each editor is a pushed screen rather than an inline card.
 * The handlers below are the originals, comments included - nothing about the upload changed.
 */
export default function ProfilPublicBanniere() {
  const { palette, spacing } = useTheme();
  const router = useRouter();
  const { me, refresh } = useSessionContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * `CF-24`. Pick a banner, upload the bytes, then commit the path - the same two-step shape as
   * `pickAvatar`, whose comment is the record for the parts they share (the mandatory
   * `preferredAssetRepresentationMode`, and why the upload and the commit are separate calls).
   *
   * 🛑 NO CROP STEP, AND THAT IS A DECISION RATHER THAN AN OMISSION. `allowsEditing` cannot produce
   * a 3:1 rectangle: `aspect` is Android-only, and on iOS the crop rectangle is always a square, so
   * the pair that gives the avatar a square on both platforms would here give a square on iOS and a
   * 3:1 on Android - and the iOS réparateur would crop a square only to see a horizontal slice of it
   * in a 3:1 strip, which is worse than not being asked. Cropping to a real aspect needs
   * `expo-image-manipulator`, a NEW NATIVE DEPENDENCY, which per `AGENTS.md` breaks the installed
   * client on the next reload and costs a build. So the picker takes the photo as it is and
   * `resizeMode="cover"` centre-crops it on the fiche - the reason the preview below is rendered at
   * the same ratio the fiche uses, so what he approves is what a client sees.
   *
   * 🛑 THE ONE FAILURE THIS CANNOT EXPLAIN WELL, measured against the live bucket on 2026-08-30
   * rather than assumed: `demande-photos` has a **10 MB** file size limit and allows only
   * `image/jpeg` / `image/png`. `quality: 0.7` puts an ordinary phone photo well under that, but a
   * genuinely huge image is refused by the BUCKET, not by us - `putSignedBytes` throws a plain
   * `Error` carrying the status, which is not an `ApiError`, so the réparateur sees the generic
   * « La bannière n'a pas pu être envoyée. » A banner is the likeliest picture in this app to be a
   * large landscape shot, so if that line is ever reported, check the status before anything else.
   */
  const pickBanner = async () => {
    // Defence in depth: the button is not rendered when the picker is unavailable. This stays
    // because the alternative to an early return is a TypeError on a null module.
    const picker = imagePicker();
    if (!picker || busy) return;

    setError(null);
    const result = await picker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // Explicitly false. See the comment above: a square crop UI for a 3:1 target misleads.
      allowsEditing: false,
      quality: 0.7,
      preferredAssetRepresentationMode:
        picker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset) return;
    const contentType = asset.mimeType;
    if (contentType !== 'image/jpeg' && contentType !== 'image/png') {
      setError('Format non supporté. Utilisez une image JPEG ou PNG.');
      return;
    }

    setBusy(true);
    try {
      const path = await uploadBanner(asset.uri, contentType);
      await api.patch<MeResponse>('/users/me/banner', { path });
      await refresh();
    } catch (e) {
      // `fields.path` is what the service attaches to a bad shape and to a missing object; a plain
      // `message` carries the réparateur-mode refusal. Both are server-authored French.
      setError(
        e instanceof ApiError
          ? (e.fields?.path ?? e.message)
          : "La bannière n'a pas pu être envoyée.",
      );
    } finally {
      setBusy(false);
    }
  };

  /** `path: null` clears the column and prunes the prefix. Same route as setting one. */
  const removeBanner = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await api.patch<MeResponse>('/users/me/banner', { path: null });
      await refresh();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "La bannière n'a pas pu être supprimée.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!me) return null;
  /**
   * `CF-49`: This editor is gated on `repairerEnabled`, deliberately. `bannerPath` is on
   * `RepairerProfile` - the trade rather than the person - and the only surface that draws a
   * banner is the fiche publique, which a client-only account does not have. A banner editor
   * reachable without this gate would collect an image with nowhere to render it.
   *
   * The mirror-image decision (photo.tsx is ungated) is documented in `photo.tsx`.
   */
  if (me.profile.repairerEnabled !== true) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
        <ScreenHeader title="Bannière" onBack={() => router.back()} />
        <View style={{ padding: spacing.lg }}>
          <Text style={{ fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13.5, color: palette.muted }}>
            Activez le mode réparateur pour ajouter une bannière.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenHeader title="Bannière" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Card>
          {/* `?? null` normalisation is unnecessary here ONLY because the check is truthy: absent,
              null and '' all fall to the placeholder. See `AGENTS.md` on new DTO fields. */}
          {me.repairer?.bannerUrl ? (
            <View style={styles.bannerFrame}>
              <Image
                source={{ uri: me.repairer.bannerUrl }}
                // Both dimensions definite, and `cover` because it is a user photograph - the same
                // two rules the fiche's own cover follows, so the preview crops the way the real
                // surface will. That is the point of showing it at this ratio at all.
                style={{ width: '100%', height: BANNER_PREVIEW_H }}
                resizeMode="cover"
                accessible
                accessibilityRole="image"
                accessibilityLabel="Votre bannière"
              />
            </View>
          ) : (
            /* Not an `Image` with no source, which renders as nothing and reads as a broken
               layout. A bordered frame with a line of French says what belongs here. */
            <View
              style={[
                styles.bannerFrame,
                styles.bannerEmpty,
                { backgroundColor: palette.mist, borderColor: palette.line },
              ]}
            >
              <Text
                style={{
                  fontFamily: 'GoogleSansFlex_400Regular',
                  fontSize: 12.5,
                  color: palette.muted,
                }}
              >
                Aucune bannière
              </Text>
            </View>
          )}

          <View style={{ gap: 4, marginTop: spacing.md }}>
            {isImagePickerAvailable() ? (
              <>
                <Button
                  label={me.repairer?.bannerUrl ? 'Changer la bannière' : 'Ajouter une bannière'}
                  onPress={pickBanner}
                  loading={busy}
                />
                {me.repairer?.bannerUrl ? (
                  <Button
                    label="Supprimer la bannière"
                    variant="text"
                    onPress={removeBanner}
                    disabled={busy}
                  />
                ) : null}
              </>
            ) : (
              /* Same reason as the photo card: the native half of `expo-image-picker` only exists
                 in a binary built after it was added, and the installed build predates it. Say so
                 rather than rendering a button that cannot work. */
              <Text
                style={{
                  fontFamily: 'GoogleSansFlex_400Regular',
                  fontSize: 12,
                  color: palette.muted,
                }}
              >
                L'ajout d'image sera disponible dans une prochaine version de l'application.
              </Text>
            )}
          </View>

          {/* Names the ONE surface it appears on. The avatar's equivalent line switches on the mode
              because its surfaces differ; this card only exists in réparateur mode, so there is
              nothing to switch on and a fixed sentence is the honest one. */}
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: 12,
              color: palette.muted,
              marginTop: spacing.md,
            }}
          >
            Elle apparaît en haut de votre fiche publique. L'image est recadrée au centre.
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
  /**
   * `CF-24`. The clip for the banner preview and, when there is none, the empty frame itself.
   *
   * `overflow: 'hidden'` is safe here for the reason `Initials` records: nothing in this card casts
   * a shadow. If one is ever added it goes on a view OUTSIDE this one - `AGENTS.md` documents that
   * pairing clipping a card's own shadow three times.
   */
  bannerFrame: { width: '100%', height: BANNER_PREVIEW_H, borderRadius: 14, borderCurve: 'continuous', overflow: 'hidden' },
  bannerEmpty: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
