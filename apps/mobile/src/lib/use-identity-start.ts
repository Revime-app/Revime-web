import { useState } from 'react';
import { Image, Platform, type ImageResolvedAssetSource } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { presentIdentityVerificationSheet } from '@stripe/stripe-identity-react-native';
import type { IdentityVariant } from '@revime/shared';
import { ApiError } from './api';
import { openStripeHandoff } from './stripe-handoff';
import { useStartIdentitySession, queryKeys } from './queries';
import { useSessionContext } from './session';

export interface UseIdentityStartOptions {
  /**
   * Whether to push '/identite/retour' upon FlowCompleted.
   * Defaults to true (standard for Profil & Statut-Vérification hub).
   * Set to false for contextual sheets (like OfferGateSheet, formerly IdentityGateSheet, in Demande).
   */
  navigateToReturn?: boolean;
  /**
   * Optional callback fired when verification flow completes successfully.
   */
  onSuccess?: () => void;
}

/**
 * CF4-01 & CF5-19 Sub-Project 2. In-App Stripe Identity Verification orchestrator hook.
 *
 * 🛑 ONE MUTATION PER SCREEN, AND `loading` IS A BILLING GUARD. Every identity CTA on a screen must pass
 * `loading` from this hook: the selfie and document-only buttons share the single
 * `startIdentitySession` mutation, and a second tap while one request is in flight would take the
 * server's variant-change branch and mint a second BILLED session while orphaning the first.
 */
export function useIdentityStart(options?: UseIdentityStartOptions) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { refresh } = useSessionContext();
  const startIdentitySession = useStartIdentitySession();
  const [error, setError] = useState<string | null>(null);

  const start = async (variant: IdentityVariant) => {
    setError(null);
    try {
      const session = await startIdentitySession.mutateAsync({ variant });

      // Web platform or missing ephemeral key: direct handoff to hosted flow
      if (Platform.OS === 'web' || !session.ephemeralKeySecret) {
        await openStripeHandoff(session.url, router);
        return;
      }

      // Native platform: In-App Stripe Identity Verification Sheet
      try {
        // Android's Stripe Identity sheet resolves `brandLogo.uri` as a drawable NAME and throws
        // Resources$NotFoundException on the main thread (uncatchable here) when it is absent. A Metro
        // asset URI is never a drawable in a release build, so Android names the one that
        // plugins/withStripeIdentityAndroid.js copies into res/drawable. Only `uri` is read natively.
        const brandLogo = Platform.select<ImageResolvedAssetSource>({
          android: { uri: 'revime_brand_logo', width: 120, height: 120, scale: 1 },
          default: Image.resolveAssetSource(require('../../assets/icon.png')),
        });
        const { status: sheetStatus, error: sheetError } = await presentIdentityVerificationSheet({
          sessionId: session.sessionId,
          ephemeralKeySecret: session.ephemeralKeySecret,
          brandLogo,
        });

        if (sheetStatus === 'FlowCompleted') {
          await queryClient.invalidateQueries({ queryKey: queryKeys.identityStatus });
          void refresh();

          if (options?.onSuccess) {
            options.onSuccess();
          }
          if (options?.navigateToReturn !== false) {
            router.push('/identite/retour');
          }
        } else if (sheetStatus === 'FlowCanceled') {
          // User dismissed the sheet cleanly; no error banner
        } else if (sheetStatus === 'FlowFailed') {
          // Fall back gracefully to hosted web handoff
          console.warn('[Identity] Native sheet failed, falling back to web:', sheetError);
          await openStripeHandoff(session.url, router);
        }
      } catch (nativeErr) {
        console.warn('[Identity] Native presentation threw, falling back to web:', nativeErr);
        await openStripeHandoff(session.url, router);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "La vérification n'a pas pu démarrer. Réessayez.");
    }
  };

  return {
    /** The selfie check - the default every primary CTA starts. */
    startIdentity: () => start('DOCUMENT_AND_SELFIE'),
    /** Document only, offered by `DocumentOnlyOption` when the server says it is available. */
    startDocumentOnly: () => start('DOCUMENT_ONLY'),
    loading: startIdentitySession.isPending,
    error,
  };
}
