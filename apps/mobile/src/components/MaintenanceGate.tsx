import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useSegments } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { legalDocumentPath, platformStatusSchema, type PlatformStatus } from '@revime/shared';
import { ApiError, api } from '../lib/api';
import { createMaintenanceWatcher, liftedFromScreen, maintenanceView, type MaintenanceView } from '../lib/maintenance';
import { onMaintenanceAnswer } from '../lib/maintenance-signal';
import { MaintenanceViewContext } from '../lib/maintenance-view-context';
import { PlatformStatusContext } from '../lib/platform-status-context';
import { useSessionContext } from '../lib/session';
import { signOutAndLeave } from '../lib/sign-out';
import { MaintenanceScreen, MaintenanceStaffBanner } from './MaintenanceScreen';
import { ReacceptScreen } from './ReacceptScreen';

async function fetchStatus(): Promise<PlatformStatus> {
  return platformStatusSchema.parse(await api.get<unknown>('/platform/status'));
}

/**
 * V7 D5 (U9, U9b, `DEC7-24`). Wraps the root navigator. While the dashboard's maintenance mode is on it
 * covers the whole app with `MaintenanceScreen` for everyone but the six staff roles, and draws the
 * team's banner above the navigator for them. Since U9b it also covers it with `ReacceptScreen` for a
 * signed-in user who owes a forced CGU re-acceptance. Reads `GET /platform/status` at launch, on
 * return to the foreground, on a timer (`createMaintenanceWatcher`) and at once on any `MAINTENANCE`
 * or `CGU_REACCEPT_REQUIRED` answer, and shares it through `PlatformStatusContext`.
 *
 * The navigator is ALWAYS rendered, at the same place in the tree, and the screens are drawn over it:
 * swapping it out would unmount expo-router's root navigator and lose the navigation state. Neither
 * screen waits for the server's refusal (`PLATFORM_GATES_ENFORCED`); this build is the one that knows
 * how to draw them.
 *
 * With the banner up, the navigator sits below it, so its top inset is zeroed: native
 * `SafeAreaView`s measure their own overlap and need nothing, and the `SafeAreaInsetsContext`
 * override covers screens that read `useSafeAreaInsets()`.
 */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { me, session, refresh } = useSessionContext();
  const router = useRouter();
  const queryClient = useQueryClient();
  const segments = useSegments() as string[];
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<PlatformStatus | null>(null);
  const [teamLogin, setTeamLogin] = useState(false);
  const [deleteFlow, setDeleteFlow] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const watcher = useRef<ReturnType<typeof createMaintenanceWatcher> | null>(null);

  const inAuthGroup = segments[0] === '(auth)';
  const inDeleteRoute = segments[0] === 'parametres' && segments[1] === 'supprimer';
  // A field newer than some APIs: read through `?? null` (apps/mobile/AGENTS.md).
  const cguVersion = me?.cguVersion ?? null;
  const view = maintenanceView({
    status,
    role: me?.role,
    teamLogin,
    inAuthGroup,
    signedIn: Boolean(session) && me !== null,
    cguVersion,
    deleteFlow,
    inDeleteRoute,
  });

  useEffect(() => {
    const w = createMaintenanceWatcher({ fetchStatus, onChange: setStatus });
    watcher.current = w;
    w.start();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') w.refresh();
    });
    const offAnswer = onMaintenanceAnswer(() => w.refresh());
    return () => {
      foreground.remove();
      offAnswer();
      w.stop();
      watcher.current = null;
    };
  }, []);

  const previousView = useRef<MaintenanceView | null>(null);
  useEffect(() => {
    watcher.current?.setOnScreen(view === 'screen');
    if (liftedFromScreen(previousView.current, view)) void refresh();
    if (view !== 'reaccept') {
      setAccepted(false);
      setAcceptError(null);
    }
    previousView.current = view;
  }, [view]);

  // Q1: leaving the login screens without a team login brings the maintenance screen back; leaving
  // the deletion screen without deleting brings the re-acceptance screen back (DEC7-25 Q1).
  useEffect(() => {
    if (teamLogin && !inAuthGroup) setTeamLogin(false);
  }, [teamLogin, inAuthGroup]);
  useEffect(() => {
    if (deleteFlow && !inDeleteRoute) setDeleteFlow(false);
  }, [deleteFlow, inDeleteRoute]);

  const accept = async (version: string) => {
    setSubmitting(true);
    setAcceptError(null);
    try {
      await api.post('/users/me/cgu-acceptance', { version });
      await refresh();
    } catch (e) {
      // CONFLICT: a newer version went live while the screen was open; re-read it and ask again.
      if (e instanceof ApiError && e.code === 'CONFLICT') {
        setAccepted(false);
        watcher.current?.refresh();
      }
      setAcceptError(e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  };

  const navigatorInsets = useMemo(() => (view === 'banner' ? { ...insets, top: 0 } : insets), [view, insets]);
  // V8 E2 (`FND8-027` (1)): the help bubbles read this to stay hidden under the two blocking screens.
  const maintenanceViewValue = useMemo(() => ({ view, statusKnown: status !== null }), [view, status]);

  return (
    <PlatformStatusContext.Provider value={status}>
      <View style={styles.root}>
        {view === 'banner' ? <MaintenanceStaffBanner /> : null}
        <SafeAreaInsetsContext.Provider value={navigatorInsets}>
          <MaintenanceViewContext.Provider value={maintenanceViewValue}>
            <View style={styles.root}>{children}</View>
          </MaintenanceViewContext.Provider>
        </SafeAreaInsetsContext.Provider>
        {view === 'screen' && status ? (
          <MaintenanceScreen
            message={status.maintenance.message}
            onRetry={() => watcher.current?.refresh()}
            onTeamLogin={() => {
              setTeamLogin(true);
              router.push('/(auth)/login');
            }}
          />
        ) : null}
        {view === 'reaccept' && status?.cgu ? (
          <ReacceptScreen
            version={status.cgu.version}
            summary={status.cgu.summary}
            accepted={accepted}
            submitting={submitting}
            error={acceptError}
            onRead={() => void Linking.openURL(`${process.env.EXPO_PUBLIC_API_URL}/api/v1${legalDocumentPath('CGU', status.cgu!.version)}`)}
            onToggle={() => setAccepted((a) => !a)}
            onAccept={() => void accept(status.cgu!.version)}
            onSignOut={() => void signOutAndLeave({ queryClient, router })}
            onDelete={() => {
              setDeleteFlow(true);
              router.push('/parametres/supprimer');
            }}
          />
        ) : null}
      </View>
    </PlatformStatusContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
