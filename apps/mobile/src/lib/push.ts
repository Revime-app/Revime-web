import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import type { MeResponse, PushData, PushPlatform } from "@revime/shared";
import {
  PUSH_SOUND_CAPABILITY,
  PUSH_SOUND_CHANNEL_NAME,
  PUSH_SOUND_KEYS,
  pushSoundChannelId,
  pushSoundFile,
} from "@revime/shared";
import { api } from "./api";
import { destinationFor } from "./notification-destination";

/**
 * `CF-44`, push notifications. Spec: docs/superpowers/specs/2026-09-07-cf-44-push-notifications-design.md §9.
 *
 * 🛑 `expo-notifications` resolves its native half with the THROWING `requireNativeModule`, so this
 * module must never be imported into a binary that lacks it. Today no such binary exists: there is
 * no dev client, and the next EAS build is the first to carry either this JavaScript or the native
 * module (`apps/mobile/AGENTS.md`, CF-44 note). A future dev client must be rebuilt after this slice.
 */

/** The route currently on top, kept for the foreground handler below. Set by `usePushPathname()`. */
let currentPathname: string | null = null;
export function setCurrentPathname(pathname: string | null): void {
  currentPathname = pathname;
}

/**
 * Validates what a push carried. Anything not shaped like `PushData` is null - an older API,
 * a test push from the Expo tool, or a future type this build does not know. `destinationFor`
 * has a `default`, so an unknown `type` still routes to null rather than throwing.
 */
export function readPushData(content: { data?: unknown }): PushData | null {
  const d = content.data as
    Partial<Record<keyof PushData, unknown>> | undefined;
  if (!d || typeof d.type !== "string") return null;
  const mode = d.mode === "REPAIRER" ? "REPAIRER" : "CLIENT";
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;
  return {
    notificationId: str(d.notificationId),
    type: d.type as PushData["type"],
    mode,
    demandeId: str(d.demandeId),
    commandeId: str(d.commandeId),
    conversationId: str(d.conversationId),
  };
}

/**
 * Foreground behaviour (spec §9.6). A banner shows while the app is open, EXCEPT when the push's
 * destination is the screen already on top - a message banner over its own open thread is noise.
 * The list entry still records it. Badge per CF4-35 (spec §4.8).
 */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = readPushData(notification.request.content);
    const target = data === null ? null : destinationFor(data);
    const onTarget = target !== null && target === currentPathname;
    return {
      shouldShowBanner: !onTarget,
      shouldShowList: true,
      shouldPlaySound: !onTarget,
      shouldSetBadge: true,
    };
  },
});

/**
 * `CF4-35`. Fetches the server-computed badge count from GET /me/badge and updates the app icon.
 */
export async function syncBadge(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const res = await api.get<{ count: number }>("/me/badge");
    if (res && typeof res.count === "number") {
      await Notifications.setBadgeCountAsync(res.count);
    }
  } catch {
    // Best-effort; swallowed
  }
}

/**
 * `CF4-35`. Clears the app icon badge (called on sign-out).
 */
export async function clearBadge(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch {
    // Best-effort; swallowed
  }
}

if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      void syncBadge();
    }
  });
}

let attemptedFor: string | null = null;
let registeredToken: string | null = null;

/**
 * V7 A5 (U6). How the last registration on this launch ended. `registerForPush` swallows every
 * failure by design, so without this the Paramètres row could only read the permission, and said
 * « Activées » on the client's Android phone while no token existed (no Firebase, `FND7-015`).
 * `idle`: nothing tried, or the permission is not granted; `failed`: granted, but no token reached
 * the API.
 */
export type PushRegistrationState = "idle" | "pending" | "registered" | "failed";
let registrationState: PushRegistrationState = "idle";
const registrationListeners = new Set<(s: PushRegistrationState) => void>();

function setRegistrationState(next: PushRegistrationState): void {
  if (next === registrationState) return;
  registrationState = next;
  for (const listener of registrationListeners) listener(next);
}

export function pushRegistrationState(): PushRegistrationState {
  return registrationState;
}

/** The home shell may still be registering when Paramètres opens; the row follows it here. */
export function onPushRegistrationChange(
  listener: (s: PushRegistrationState) => void,
): () => void {
  registrationListeners.add(listener);
  return () => {
    registrationListeners.delete(listener);
  };
}

/**
 * The owner's decision (a), spec §0.2 Q2: ONE system prompt, on the first home screen after sign-in.
 * Once per user per cold start. Every step is inside the try: a simulator, a denial, an offline
 * token fetch or an API failure leaves the app exactly as it is today and logs once.
 *
 * Nothing is persisted on the device: the PUT is idempotent, so re-registering on every launch is
 * the refresh that keeps `lastSeenAt` honest and re-enables a token Expo had reported gone.
 *
 * `force` is for the Paramètres row's « Activer » (spec §9.7): the home shell has already
 * attempted this user, so without it the row's tap would return before asking.
 */
export async function registerForPush(
  userId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  if (attemptedFor === userId && !opts.force) return;
  attemptedFor = userId;
  if (Platform.OS === "web") return;
  setRegistrationState("pending");
  promptInFlight = true;
  try {
    // V7 FND7-076: the channels come BEFORE the permission request. Expo: on Android 13+ the prompt
    // « will not appear until at least one notification channel is created ». They used to be made
    // only after a grant, which a never-shown prompt could not give.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#002C5E', // primary navy
      });

      // CF4-36: one channel per client sound (spec docs/superpowers/specs/2026-10-02-cf4-36-notification-sounds-design.md §5).
      // An Android channel's sound is fixed once the channel exists, so a different sound needs a NEW
      // file name AND a NEW channel id (see packages/shared/src/push-sound.ts) - never edit a shipped file in place.
      for (const key of PUSH_SOUND_KEYS) {
        await Notifications.setNotificationChannelAsync(pushSoundChannelId(key), {
          name: PUSH_SOUND_CHANNEL_NAME[key],
          importance: Notifications.AndroidImportance.MAX,
          sound: pushSoundFile(key),
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#002C5E',
        });
      }
      // The placeholder channel builds 20-23 created; this build no longer bundles its sound. No-op if absent.
      await Notifications.deleteNotificationChannelAsync('revime');
    }

    // 🛑 V7 FND7-076. Ask whenever the permission is not granted and the OS still lets us ask - NOT
    // only on UNDETERMINED. expo-notifications on Android 13+ reports a permission that was NEVER
    // asked as DENIED (`NotificationPermissionsModule`, its `!areEnabled -> DENIED` branch: the OS
    // keeps notifications off until POST_NOTIFICATIONS is granted). Asking only on UNDETERMINED meant
    // Android never asked at all, so production held zero Android tokens. On iOS a refused prompt is
    // never shown twice, so asking again there just returns the same DENIED.
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== Notifications.PermissionStatus.GRANTED && current.canAskAgain) {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    settlePushPrompt();
    if (status !== Notifications.PermissionStatus.GRANTED) {
      setRegistrationState("idle");
      return;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as
      string | undefined;
    if (!projectId) {
      console.warn(
        "[push] no EAS projectId in the app config; not registering",
      );
      setRegistrationState("failed");
      return;
    }

    // Rejects on a simulator and on Android without Firebase (spec A 9.1): caught below. Android's
    // Firebase config is `app.json` `android.googleServicesFile` since V7 A5 (U6).
    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const platform: PushPlatform =
      Platform.OS === "android" ? "ANDROID" : "IOS";
    // `putJson` goes through `call`, which resolves a 204 to null (V7 FND7-077; spec
    // test/v7-api-no-content.spec.ts). Until that line existed this threw AFTER the server had
    // stored the token, so every phone read « Non disponibles » and was never unregistered.
    await api.putJson<null>("/notifications/push-token", {
      token,
      platform,
      sound: PUSH_SOUND_CAPABILITY,
    });
    registeredToken = token;
    setRegistrationState("registered");
  } catch (e) {
    console.warn("[push] registration skipped:", e);
    setRegistrationState("failed");
  } finally {
    // A throw before or during the prompt (channel setup, the permission call) must not hold the tour.
    if (promptInFlight) settlePushPrompt();
  }
}

// V8 E2 (`FND8-027` (2)): the help bubbles' offer appears when the tabs mount, the same moment as the
// OS notification prompt; the tour waits for the prompt to be answered so it never sits under it.
let promptInFlight = false;
let promptSettled = false;
let promptWaiters: Array<() => void> = [];

function settlePushPrompt(): void {
  promptInFlight = false;
  promptSettled = true;
  const waiters = promptWaiters;
  promptWaiters = [];
  for (const done of waiters) done();
}

/**
 * Resolves once this launch's permission step is over (granted, denied or not askable); at once if it
 * already ended and none is in flight; after `timeoutMs` whatever happens, so a launch that never
 * registers (a signed-out shell, the web) does not hold the tour.
 */
export function waitForPushPrompt(timeoutMs = 4000): Promise<void> {
  if (promptSettled && !promptInFlight) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    // Review fix I2: the timeout is for a launch that never asks, never for a prompt still on screen.
    const timer = setTimeout(() => {
      if (!promptInFlight) done();
    }, timeoutMs);
    promptWaiters.push(done);
  });
}

/** Mounted on the home shell (`(tabs)/_layout.tsx`), which renders only for a signed-in user. */
export function usePushRegistration(me: MeResponse | null): void {
  const userId = me?.id ?? null;
  useEffect(() => {
    if (userId !== null) void registerForPush(userId);
  }, [userId]);
}

/**
 * Sign-out step 0 (spec §9.3): best-effort, swallowed on failure - the token is unique alone, so
 * the next account's registration on this phone reassigns it anyway (§3.1).
 */
export async function unregisterPush(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  attemptedFor = null;
  setRegistrationState("idle");
  if (token === null) return;
  try {
    await api.post<void>("/notifications/push-token/unregister", { token });
  } catch {
    // Deliberately swallowed. See sign-out.ts's step 1 for the same reasoning.
  }
}
