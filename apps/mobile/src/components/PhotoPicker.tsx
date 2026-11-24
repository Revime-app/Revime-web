import { useRef } from 'react';
import { View, Text, Pressable, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme';
import { IconCamera, IconCancel } from '../icons';
import { uploadPhoto } from '../lib/photo-upload';
import { ApiError } from '../lib/api';
import { MAX_DEMANDE_PHOTOS } from '@revime/shared';
import { generateUUID } from '../lib/uuid';
// 🛑 NOT `import * as ImagePicker from 'expo-image-picker'`. That is a native module whose JS
// entry throws at MODULE SCOPE when it is missing from the binary, which took down the entire
// tab tree rather than just this screen. See src/lib/image-picker.ts for the measurement.
import { imagePicker, isImagePickerAvailable } from '../lib/image-picker';

export type PickedPhoto = {
  key: string;
  localUri: string;
  path: string | null;
  state: 'uploading' | 'done' | 'failed';
  contentType?: string;
  errorMessage?: string;
};

type Props = {
  photos: PickedPhoto[];
  onChange: (updater: PickedPhoto[] | ((prev: PickedPhoto[]) => PickedPhoto[])) => void;
};

/**
 * Extract a user-facing error message from different error types.
 * - ApiError with TOO_MANY_REQUESTS: rate limit (60/hour cap hit)
 * - ApiError with INTERNAL: service unavailable (storage unconfigured on both
 *   local dev and production today, so this is the common path)
 * - ApiError with French message: use it
 * - Other errors: generic message
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'TOO_MANY_REQUESTS') {
      return "Trop de photos envoyées. Réessayez dans quelques minutes.";
    }
    if (error.code === 'INTERNAL' || error.code === 'SERVICE_UNAVAILABLE') {
      return "Service temporairement indisponible. Réessayez plus tard.";
    }
    // Use the server's French message if available
    return error.message;
  }
  return "Impossible d'envoyer la photo. Réessayez.";
}

/**
 * The prototype's geometry, verbatim (repareme-web/src/screens/Publier.tsx:96-137): a
 * `Photos · n/10` label; a wrapping row of **76pt** tiles at radius 14 over `palette.mist`
 * with `resizeMode="cover"`; a **22pt** circular remove button at top-right on
 * `rgba(20,20,20,0.72)` with a 13pt white glyph; and, while under the cap, a dashed
 * `Ajouter` tile (1.5pt dashed `palette.line`, camera glyph at 22, label 11/600
 * `palette.muted`).
 */
export function PhotoPicker({ photos, onChange }: Props) {
  const { palette, spacing } = useTheme();

  /**
   * RETRY DECISION: A failed tile shows a visible error state (red border) and tapping
   * it retries the upload. This is better than a separate retry button because:
   * 1. The error is local to that tile - it doesn't block the wizard
   * 2. The user can continue adding other photos
   * 3. Tapping the tile is a natural interaction
   *
   * BLOCKING DECISION: Failed uploads do NOT block `canContinue`. Reasoning:
   * 1. The server accepts `photoPaths: []`, so photos are optional
   * 2. A single failed upload shouldn't prevent submitting 9 working ones
   * 3. The user can remove the failed tile or retry it
   * 4. On submit, we filter to only `state === 'done'` photos
   */
  const pickPhotos = async () => {
    // Defence in depth: the Ajouter tile is not rendered when the picker is unavailable, so
    // this cannot normally be reached. It stays because the alternative to an early return is
    // a TypeError on a null module, and a screen that does nothing beats a screen that dies.
    const picker = imagePicker();
    if (!picker) return;

    const result = await picker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_DEMANDE_PHOTOS - photos.length,
      quality: 0.7,
      /**
       * 🛑 WITHOUT THIS, EVERY ORDINARY IPHONE CAMERA PHOTO IS REFUSED. Added 2026-08-21.
       *
       * iPhones shoot HEIC by default, the bucket allows only `image/jpeg` and `image/png`, and
       * `expo-image-picker` does NOT transcode: `ios/ImageUtils.swift:147` is
       * `case UTType.heic.identifier: return (rawData, ".heic")`, so the asset arrives as HEIC
       * and the guard below fails it with « Format non supporté ». `quality` does not help --
       * that switch runs before any re-encode.
       *
       * `Compatible` maps to `PHPickerConfiguration.assetRepresentationMode = .compatible`
       * (`ios/ImagePickerModule.swift:157`), which makes iOS itself hand us JPEG. The extension
       * then falls to the `default` branch, and `mimeType` follows the extension
       * (`ios/MediaHandler.swift:154`), so we get `image/jpeg`. **No new dependency** -- this is
       * an option on the native module we already ship, not `expo-image-manipulator`, which the
       * spec declined.
       *
       * 🛑 And it must be set EXPLICITLY: the TS docs claim the default is `Automatic`, but the
       * native field default is `.current` -- "avoid transcoding" -- at
       * `ios/ImagePickerOptions.swift:44`. The documentation and the code disagree; the code wins.
       *
       * Why this was not caught before: the only photos ever picked on a device were PNG
       * SCREENSHOTS, which are already an allowed type, so the HEIC path never ran.
       */
      preferredAssetRepresentationMode:
        picker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });

    if (result.canceled) return;

    /**
     * Read each asset's mimeType and validate it.
     *
     * ~~Setting `quality` usually makes iOS re-encode to JPEG~~ - **that was wrong, and it is
     * why every camera photo would have failed.** `quality` does not decide the format at all;
     * the source's registered type does. The real remedy is
     * `preferredAssetRepresentationMode: Compatible` above, which makes iOS hand us JPEG before
     * this code runs.
     *
     * This guard is now a genuine last resort rather than the expected path: it catches a type
     * iOS declined to transcode, and refusing is still right, because uploading bytes under a
     * lying content-type header makes the bucket reject the MIME mismatch - which is exactly
     * the 400 that broke this on 2026-08-21, see `src/lib/photo-upload.ts`.
     */
    const newPhotos: PickedPhoto[] = result.assets.map((asset) => {
      const contentType = asset.mimeType;
      const key = generateUUID();

      // Only image/jpeg and image/png are supported
      if (contentType !== 'image/jpeg' && contentType !== 'image/png') {
        return {
          key,
          localUri: asset.uri,
          path: null,
          state: 'failed' as const,
          contentType,
          errorMessage: "Format non supporté. Veuillez utiliser JPEG ou PNG.",
        };
      }

      return {
        key,
        localUri: asset.uri,
        path: null,
        state: 'uploading' as const,
        contentType,
      };
    });

    onChange((prev) => [...prev, ...newPhotos]);

    // Upload each photo in the background (skip already-failed ones)
    for (const photo of newPhotos) {
      if (photo.state === 'failed') continue;

      try {
        const path = await uploadPhoto(photo.localUri, photo.contentType!);
        // Update the photo state to 'done' with the path
        onChange((prev) =>
          prev.map((p) => (p.key === photo.key ? { ...p, path, state: 'done' as const } : p))
        );
      } catch (error) {
        // Update the photo state to 'failed' with error message
        const errorMessage = extractErrorMessage(error);
        onChange((prev) =>
          prev.map((p) => (p.key === photo.key ? { ...p, state: 'failed' as const, errorMessage } : p))
        );
      }
    }
  };

  const retryUpload = async (photo: PickedPhoto) => {
    // If the photo failed due to unsupported format, retrying won't help
    if (!photo.contentType || (photo.contentType !== 'image/jpeg' && photo.contentType !== 'image/png')) {
      return;
    }

    // Mark as uploading and clear error message
    onChange((prev) => prev.map((p) => (p.key === photo.key ? { ...p, state: 'uploading' as const, errorMessage: undefined } : p)));

    try {
      const path = await uploadPhoto(photo.localUri, photo.contentType);
      onChange((prev) => prev.map((p) => (p.key === photo.key ? { ...p, path, state: 'done' as const } : p)));
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      onChange((prev) => prev.map((p) => (p.key === photo.key ? { ...p, state: 'failed' as const, errorMessage } : p)));
    }
  };

  const removePhoto = (key: string) => {
    onChange((prev) => prev.filter((p) => p.key !== key));
  };

  const failedCount = photos.filter((p) => p.state === 'failed').length;
  // Cheap after the first call -- the loader memoises -- so this needs no useMemo.
  const pickerAvailable = isImagePickerAvailable();

  return (
    <View>
      <Text
        style={{
          fontFamily: 'GoogleSansFlex_600SemiBold',
          fontSize: 12.5,
          color: palette.ink2,
          marginBottom: spacing.xs,
        }}
      >
        Photos · {photos.length}/{MAX_DEMANDE_PHOTOS}
      </Text>

      {/* Says so plainly rather than rendering a button that cannot work. The rest of the
          wizard is unaffected: the server defaults photoPaths to [], so a demande published
          without photos is a supported outcome and never a refusal. */}
      {!pickerAvailable && (
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_400Regular',
            fontSize: 11.5,
            color: palette.muted,
            marginBottom: spacing.xs,
          }}
        >
          L'ajout de photos n'est pas disponible dans cette version de l'application. Vous
          pouvez publier votre demande sans photo.
        </Text>
      )}

      {/**
       * WARN when there are failed uploads, so the user knows before continuing.
       * This does NOT block canContinue because:
       * 1. Photos are optional (server accepts empty array)
       * 2. The user might want to proceed without the failed ones
       * 3. Blocking would frustrate users who just want fewer photos
       * 4. They can retry or remove failed tiles, or continue anyway
       */}
      {failedCount > 0 && (
        <View style={{ backgroundColor: palette.amberSoft, padding: spacing.sm, borderRadius: 8, marginBottom: spacing.sm }}>
          <Text style={{ fontSize: 11.5, color: palette.ink, fontFamily: 'GoogleSansFlex_500Medium' }}>
            {failedCount === 1
              ? "1 photo n'a pas pu être envoyée."
              : `${failedCount} photos n'ont pas pu être envoyées.`}{' '}
            Vous pouvez réessayer ou les supprimer.
          </Text>
        </View>
      )}

      <View style={styles.grid}>
        {photos.map((photo) => (
          <View key={photo.key} style={styles.tileWrapper}>
            <View style={styles.tileContainer}>
              <Pressable
                onPress={() => photo.state === 'failed' && retryUpload(photo)}
                style={[
                  styles.tile,
                  { backgroundColor: palette.mist, borderColor: photo.state === 'failed' ? palette.red : 'transparent' },
                ]}
              >
                <Image source={{ uri: photo.localUri }} style={styles.image} resizeMode="cover" />
                {photo.state === 'uploading' && (
                  <View style={styles.overlay}>
                    <ActivityIndicator color="#FFFFFF" />
                  </View>
                )}
                {photo.state === 'failed' && (
                  <View style={styles.overlay}>
                    <Text style={{ color: '#FFFFFF', fontSize: 11, fontFamily: 'GoogleSansFlex_600SemiBold' }}>
                      Réessayer
                    </Text>
                  </View>
                )}
              </Pressable>
              <Pressable
                onPress={() => removePhoto(photo.key)}
                style={styles.removeButton}
              >
                <IconCancel size={13} color="#FFFFFF" strokeWidth={2.5} />
              </Pressable>
            </View>
            {photo.state === 'failed' && photo.errorMessage && (
              <Text style={{ fontSize: 10, color: palette.red, marginTop: 2, width: 76 }}>
                {photo.errorMessage}
              </Text>
            )}
          </View>
        ))}

        {pickerAvailable && photos.length < MAX_DEMANDE_PHOTOS && (
          <Pressable onPress={pickPhotos} style={[styles.tile, styles.addTile, { borderColor: palette.line }]}>
            <IconCamera size={22} color={palette.muted} strokeWidth={1.8} />
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_600SemiBold',
                fontSize: 11,
                color: palette.muted,
                marginTop: 4,
              }}
            >
              Ajouter
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tileWrapper: {
    flexDirection: 'column',
  },
  tileContainer: {
    position: 'relative',
    width: 76,
    height: 76,
  },
  tile: {
    width: 76,
    height: 76,
    borderRadius: 14,
    borderCurve: 'continuous',
    overflow: 'hidden',
    borderWidth: 1,
  },
  addTile: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(20, 20, 20, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(20, 20, 20, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
