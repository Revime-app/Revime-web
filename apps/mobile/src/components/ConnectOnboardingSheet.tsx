import React from 'react';
import { Modal, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ConnectComponentsProvider,
  ConnectAccountOnboarding,
  type StripeConnectInstance,
} from '@stripe/stripe-react-native';
import { palette, spacing } from '../theme';
import { Button } from './Button';
import { IconCancel } from '../icons';

const SHEET_TITLE = 'Configuration des virements';

export interface ConnectOnboardingSheetProps {
  visible: boolean;
  connectInstance: StripeConnectInstance | null;
  isTimedOut?: boolean;
  /** Stripe's own « onExit »: the user finished, or closed Stripe's page. */
  onExit: () => void;
  // The next four are REQUIRED on purpose. Each is the only way out of a state the sheet can be
  // in, and a caller that forgot one would compile and strand the user: no `onRetry` leaves a dead
  // button on the timed-out screen, no `onDismiss` leaves it without a way to close, no
  // `onLoadError` leaves a Stripe page that failed to load without the hosted flow, and no
  // `onPageDidLoad` lets the timeout fire on a page that loaded.
  /** « Réessayer » on the timed-out screen. */
  onRetry: () => void;
  /** Closes the timed-out screen. Not `onExit`: nothing was submitted. */
  onDismiss: () => void;
  onLoadError: (error: unknown) => void;
  onPageDidLoad: () => void;
}

export function ConnectOnboardingSheet({
  visible,
  connectInstance,
  isTimedOut = false,
  onExit,
  onRetry,
  onDismiss,
  onLoadError,
  onPageDidLoad,
}: ConnectOnboardingSheetProps) {
  if (!visible || !connectInstance) return null;

  if (isTimedOut) {
    // A React Native Modal of our own: Stripe's component draws its own sheet and has nothing to
    // say once its page has hung, so the timed-out screen replaces it rather than sitting on it.
    return (
      <Modal
        visible={visible}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={onDismiss}
      >
        <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]}>
          <View style={[styles.header, { borderBottomColor: palette.line }]}>
            <Text style={[styles.headerTitle, { color: palette.ink }]}>{SHEET_TITLE}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              onPress={onDismiss}
              hitSlop={12}
              style={styles.closeButton}
            >
              <IconCancel size={22} color={palette.ink} />
            </Pressable>
          </View>
          <View style={styles.centerContainer}>
            <Text style={[styles.timeoutTitle, { color: palette.ink }]}>
              La page ne répond pas
            </Text>
            <Text style={[styles.timeoutBody, { color: palette.muted }]}>
              Le chargement prend plus de temps que prévu. Veuillez vérifier votre connexion et réessayer.
            </Text>
            <View style={{ width: '100%', maxWidth: 300, marginTop: spacing.md }}>
              <Button label="Réessayer" onPress={onRetry} />
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <ConnectComponentsProvider connectInstance={connectInstance}>
      <ConnectAccountOnboarding
        title={SHEET_TITLE}
        collectionOptions={{ fields: 'eventually_due' }}
        onExit={onExit}
        onLoadError={onLoadError}
        onPageDidLoad={onPageDidLoad}
      />
    </ConnectComponentsProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 17,
  },
  closeButton: {
    padding: 6,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  timeoutTitle: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 20,
    textAlign: 'center',
  },
  timeoutBody: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
