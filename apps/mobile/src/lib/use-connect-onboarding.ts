import { useState, useRef, useEffect } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  loadConnectAndInitialize,
  type StripeConnectInstance,
} from '@stripe/stripe-react-native';
import type { ConnectOnboardingResponse } from '@revime/shared';
import { useTheme } from '../theme';
import { useSessionContext } from './session';
import { useStartConnectOnboarding, queryKeys } from './queries';
import { openStripeHandoff } from './stripe-handoff';
import { ApiError } from './api';
import { useStepUp } from './step-up-context';

/**
 * How long either wait may last: the API call that starts onboarding, and the Stripe page after the
 * sheet opens. A single value on purpose, so the two ceilings cannot drift apart.
 */
export const CONNECT_ONBOARDING_TIMEOUT_MS = 15_000;

/** The sheet may hang this many times in a row before we stop retrying it and use the hosted flow. */
const MAX_SHEET_TIMEOUTS = 2;

const START_FAILED_MESSAGE = "La configuration n'a pas pu démarrer. Réessayez.";
// For the API call only. The sheet's own timeout has its own screen (« La page ne répond pas »).
const START_TIMEOUT_MESSAGE = 'Le service ne répond pas. Vérifiez votre connexion et réessayez.';

/** Thrown by the race against the API call, so `catch` can tell a timeout from a real failure. */
class ConnectStartTimeoutError extends Error {}

export interface UseConnectOnboardingOptions {
  navigateToReturn?: boolean;
  onSuccess?: () => void;
}

export function useConnectOnboarding(options?: UseConnectOnboardingOptions) {
  const router = useRouter();
  const { palette } = useTheme();
  const { refresh } = useSessionContext();
  const queryClient = useQueryClient();
  const startConnectOnboarding = useStartConnectOnboarding();
  const withStepUp = useStepUp();

  const [visible, setVisible] = useState(false);
  const [connectInstance, setConnectInstance] = useState<StripeConnectInstance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTimedOut, setIsTimedOut] = useState(false);
  // The hosted-onboarding URL of the CURRENT attempt only. It is a ref because handleLoadError runs
  // later, from the sheet, with no `response` in scope. Stripe account links are single-use and
  // short-lived, so startOnboarding clears it first: a link from an earlier attempt must never be
  // opened in place of the current attempt's error.
  const fallbackUrlRef = useRef<string | null>(null);
  const sheetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sheet timeouts since the user last STARTED onboarding (a « Réessayer » does not reset it). The
  // second one hands over to the hosted flow: a sheet that hangs twice will hang a third time, and
  // without this the user loops on « Réessayer » with no way to finish (S3 review, ISS-006).
  const sheetTimeoutsRef = useRef(0);

  const clearSheetTimer = () => {
    if (sheetTimeoutRef.current) {
      clearTimeout(sheetTimeoutRef.current);
      sheetTimeoutRef.current = null;
    }
  };

  // Everything that takes the sheet off screen, whatever the reason.
  const closeSheet = () => {
    clearSheetTimer();
    setIsTimedOut(false);
    setVisible(false);
    setConnectInstance(null);
  };

  useEffect(() => clearSheetTimer, []);

  const begin = async () => {
    setError(null);
    fallbackUrlRef.current = null;
    let response: ConnectOnboardingResponse | undefined;
    try {
      // One API attempt, raced against its own timeout. A fresh timer per attempt: V7 U2b may ask
      // for the password between two attempts, and the user's typing must not count against it.
      const attempt = async () => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new ConnectStartTimeoutError()),
            CONNECT_ONBOARDING_TIMEOUT_MS,
          );
        });
        // The mutation is not cancelled when the race is lost: it settles later and is ignored here.
        try {
          return await Promise.race([startConnectOnboarding.mutateAsync(), timeoutPromise]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      };

      // V7 A11 (U2b, Q6): changing an IBAN already on file asks for the password (or a code) first.
      const started = await withStepUp(attempt);
      if (!started.ok) return;
      response = started.value;

      fallbackUrlRef.current = response.url;

      // Web fallback
      if (Platform.OS === 'web') {
        await openStripeHandoff(response.url, router);
        return;
      }

      const { publishableKey, clientSecret } = response;

      // Initialize Revime-branded Connect instance
      const instance = loadConnectAndInitialize({
        publishableKey,
        fetchClientSecret: async () => clientSecret,
        appearance: {
          variables: {
            colorPrimary: palette.ink,
            colorBackground: palette.paper,
            colorText: palette.ink,
            buttonPrimaryColorBackground: palette.ink,
            buttonPrimaryColorText: palette.paper,
            buttonBorderRadius: '14px',
            borderRadius: '14px',
            fontFamily: 'Google Sans Flex',
          },
        },
      });

      setConnectInstance(instance);
      setVisible(true);

      clearSheetTimer();
      sheetTimeoutRef.current = setTimeout(handleSheetTimeout, CONNECT_ONBOARDING_TIMEOUT_MS);
    } catch (e: unknown) {
      clearSheetTimer();
      setIsTimedOut(false);
      if (e instanceof ConnectStartTimeoutError) {
        setError(START_TIMEOUT_MESSAGE);
        return;
      }
      console.warn('[connect] in-app onboarding init failed, falling back to handoff', e);
      // `response` is only set when THIS attempt's API call succeeded, i.e. the failure was the
      // in-app initialisation. If the call itself failed there is no link to hand off to, and the
      // API's own message is the one to show.
      const url = response?.url;
      if (url) {
        try {
          await openStripeHandoff(url, router);
          return;
        } catch (handoffErr) {
          console.warn('[connect] fallback handoff failed', handoffErr);
        }
      }
      setError(e instanceof ApiError ? e.message : START_FAILED_MESSAGE);
    }
  };

  const startOnboarding = () => {
    sheetTimeoutsRef.current = 0;
    return begin();
  };

  const handleSheetTimeout = () => {
    sheetTimeoutsRef.current += 1;
    if (sheetTimeoutsRef.current >= MAX_SHEET_TIMEOUTS) {
      void handleLoadError(new Error('The Connect sheet timed out twice'));
      return;
    }
    setIsTimedOut(true);
  };

  const handlePageDidLoad = () => {
    clearSheetTimer();
    setIsTimedOut(false);
    sheetTimeoutsRef.current = 0;
  };

  const handleRetry = async () => {
    closeSheet();
    await begin();
  };

  // The timed-out screen's close button. Not `handleExit`: nothing was submitted, and `/connect/retour`
  // would greet the user with « Informations envoyées ».
  const handleDismiss = () => {
    closeSheet();
    sheetTimeoutsRef.current = 0;
  };

  const handleLoadError = async (err: unknown) => {
    setError(null);
    console.warn('[connect] in-app onboarding component failed, falling back to handoff', err);
    closeSheet();
    const url = fallbackUrlRef.current;
    if (url) {
      try {
        await openStripeHandoff(url, router);
      } catch (handoffErr) {
        console.warn('[connect] fallback handoff after load error failed', handoffErr);
        setError(START_FAILED_MESSAGE);
      }
    } else {
      setError(START_FAILED_MESSAGE);
    }
  };

  const handleExit = async () => {
    closeSheet();
    sheetTimeoutsRef.current = 0;
    await queryClient.invalidateQueries({ queryKey: queryKeys.connectStatus });
    await queryClient.invalidateQueries({ queryKey: ['connect-status'] });
    await refresh();

    if (options?.onSuccess) {
      options.onSuccess();
    }
    if (options?.navigateToReturn !== false) {
      router.push('/connect/retour');
    }
  };

  return {
    startOnboarding,
    handleRetry,
    loading: startConnectOnboarding.isPending,
    error,
    visible,
    isTimedOut,
    connectInstance,
    handleExit,
    handleDismiss,
    handleLoadError,
    handlePageDidLoad,
  };
}
