import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Linking, Platform, ScrollView, Switch, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { MeResponse } from '@revime/shared';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { SettingsRow, SettingsSection } from '../../src/components/SettingsRow';
import { api, ApiError } from '../../src/lib/api';
import { onPushRegistrationChange, pushRegistrationState, registerForPush } from '../../src/lib/push';
import { pushRowState } from '../../src/lib/push-row';
import { useSessionContext } from '../../src/lib/session';
import { useTheme } from '../../src/theme';

/**
 * `CF-47` task 12. Notifications preferences: three toggles over all notification types.
 *
 * 🛑 THE `?? true` ON EVERY READ IS REQUIRED, FOR TWO INDEPENDENT REASONS:
 * 1. An app newer than the API receives these as `undefined`, and `undefined` in a
 *    Switch's `value` makes it UNCONTROLLED - it moves under the finger and snaps
 *    back, with no error anywhere.
 * 2. `true` is also the correct DEFAULT: it is the behaviour every account had
 *    before these columns existed, and it matches the column defaults.
 *
 * 🛑 EACH FLIP WRITES ONE KEY. The endpoint is partial precisely so flipping one
 * switch cannot clobber the other two with a stale cached value.
 *
 * `CF-44` (2026-09-07) ended the copy constraint this header used to carry. Until then
 * `NotificationsService.emit()` wrote an in-app row and NOTHING else, so the copy here was
 * forbidden to mention push or « sur votre téléphone ». `emit` now dispatches a push after every
 * write, behind the SAME three preferences, so the copy says so - and the row at the top reads the
 * live permission (and, since V7 A5, whether this phone registered), because those are the states
 * these toggles cannot fix.
 */
export default function NotificationsScreen() {
  const { palette, accent, spacing } = useTheme();
  const { me, refresh } = useSessionContext();

  // 🛑 Normalize at entry. `?? true` is not defensive noise - it is required for two
  // independent reasons documented at the top of this file.
  const offers = me?.profile.notifyOffers ?? true;
  const messages = me?.profile.notifyMessages ?? true;
  const commandes = me?.profile.notifyCommandes ?? true;
  const marketing = me?.marketingConsent ?? false;

  // Track in-flight state per switch, so one write does not disable the others.
  const [savingOffers, setSavingOffers] = useState(false);
  const [savingMessages, setSavingMessages] = useState(false);
  const [savingCommandes, setSavingCommandes] = useState(false);
  const [savingMarketing, setSavingMarketing] = useState(false);

  // CF-44. The live permission (iOS and Android). Read on mount and again on foreground - the screen may be
  // left open while the user visits Réglages. `null` until the first read answers.
  const [permission, setPermission] = useState<Notifications.PermissionStatus | null>(null);
  const readPermission = useCallback(async () => {
    try {
      setPermission((await Notifications.getPermissionsAsync()).status);
    } catch {
      setPermission(null);
    }
  }, []);
  useEffect(() => {
    void readPermission();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void readPermission();
    });
    return () => sub.remove();
  }, [readPermission]);

  // V7 A5 (U6). Whether THIS phone's token reached the API, not just whether the permission is
  // granted: on the client's Android phone the permission was granted and no token existed.
  const [registration, setRegistration] = useState(pushRegistrationState);
  useEffect(() => onPushRegistrationChange(setRegistration), []);

  const pushRow = pushRowState({
    permission:
      permission === Notifications.PermissionStatus.GRANTED
        ? 'granted'
        : permission === Notifications.PermissionStatus.DENIED
          ? 'denied'
          : permission === Notifications.PermissionStatus.UNDETERMINED
            ? 'undetermined'
            : null,
    registration,
    platform: Platform.OS === 'android' ? 'android' : 'ios',
  });
  const pushOnPress =
    pushRow.action === 'settings'
      ? () => void Linking.openSettings()
      : pushRow.action === 'register' && me !== null
        ? () => void registerForPush(me.id, { force: true }).then(readPermission)
        : null;

  const toggleOffers = async (next: boolean) => {
    if (savingOffers) return;
    setSavingOffers(true);
    try {
      await api.patch<MeResponse>('/users/me/notification-preferences', { offers: next });
      await refresh();
    } catch (e) {
      // On error, the switch reverts - refresh() was not called, so local state still
      // holds the old value. Show the error in French.
      const message =
        e instanceof ApiError ? e.message : "Impossible d'enregistrer vos préférences.";
      Alert.alert('Erreur', message);
      console.error('Failed to update offers preference:', e);
    } finally {
      setSavingOffers(false);
    }
  };

  const toggleMessages = async (next: boolean) => {
    if (savingMessages) return;
    setSavingMessages(true);
    try {
      await api.patch<MeResponse>('/users/me/notification-preferences', { messages: next });
      await refresh();
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : "Impossible d'enregistrer vos préférences.";
      Alert.alert('Erreur', message);
      console.error('Failed to update messages preference:', e);
    } finally {
      setSavingMessages(false);
    }
  };

  const toggleCommandes = async (next: boolean) => {
    if (savingCommandes) return;
    setSavingCommandes(true);
    try {
      await api.patch<MeResponse>('/users/me/notification-preferences', { commandes: next });
      await refresh();
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : "Impossible d'enregistrer vos préférences.";
      Alert.alert('Erreur', message);
      console.error('Failed to update commandes preference:', e);
    } finally {
      setSavingCommandes(false);
    }
  };

  const toggleMarketing = async (next: boolean) => {
    if (savingMarketing) return;
    setSavingMarketing(true);
    try {
      await api.patch<MeResponse>('/users/me/notification-preferences', { marketing: next });
      await refresh();
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : "Impossible d'enregistrer vos préférences.";
      Alert.alert('Erreur', message);
      console.error('Failed to update marketing preference:', e);
    } finally {
      setSavingMarketing(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper }} edges={['top']}>
      <ScreenHeader title="Notifications" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {/* CF-44, spec §9.7, and V7 A5 (U6): the states live in `src/lib/push-row.ts`. `sub`
            carries a hint only when the toggles below cannot fix the state. */}
        <SettingsSection title={null}>
          <SettingsRow
            label="Notifications push"
            value={pushRow.value}
            onPress={pushOnPress}
            sub={pushRow.sub}
            subTone={pushRow.tone}
            last
          />
        </SettingsSection>

        <SettingsSection title="Préférences">
          <SettingsRow
            label="Offres"
            onPress={null}
            trailing={
              <Switch
                value={offers}
                onValueChange={toggleOffers}
                disabled={savingOffers}
                // ON track set to accent.accent - mode-aware and what the rest of the app tints
                // controls with. `palette.green` and `accent.accent` are both tokens; setting
                // explicit colors is not inventing unlisted ones.
                trackColor={{ true: accent.accent }}
              />
            }
          />
          <SettingsRow
            label="Messages"
            onPress={null}
            trailing={
              <Switch
                value={messages}
                onValueChange={toggleMessages}
                disabled={savingMessages}
                trackColor={{ true: accent.accent }}
              />
            }
          />
          <SettingsRow
            label="Commandes et paiements"
            onPress={null}
            trailing={
              <Switch
                value={commandes}
                onValueChange={toggleCommandes}
                disabled={savingCommandes}
                trackColor={{ true: accent.accent }}
              />
            }
          />
          <SettingsRow
            label="Offres commerciales"
            onPress={null}
            sub="Promotions et actualités Revime"
            trailing={
              <Switch
                value={marketing}
                onValueChange={toggleMarketing}
                disabled={savingMarketing}
                trackColor={{ true: accent.accent }}
              />
            }
            last
          />
        </SettingsSection>

        <Text
          style={{
            fontFamily: 'GoogleSansFlex_400Regular',
            fontSize: 13,
            lineHeight: 18,
            color: palette.muted,
            marginTop: spacing.md,
            marginHorizontal: 4,
          }}
        >
          Ces réglages contrôlent les notifications dans l'application et sur votre téléphone.
          Désactiver une catégorie empêchera les nouvelles notifications de ce type d'apparaître
          dans votre fil et d'être envoyées à votre téléphone.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
