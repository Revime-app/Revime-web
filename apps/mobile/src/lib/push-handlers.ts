import { useEffect, useState } from "react";
import { router, usePathname } from "expo-router";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import type { MeResponse, PushData } from "@revime/shared";
import { api } from "./api";
import { destinationFor } from "./notification-destination";
import { readPushData, setCurrentPathname } from "./push";
import { queryKeys } from "./queries";

/**
 * `CF-44`. The three hooks the root layout mounts. Spec §9.5 and §9.6.
 */

/** Keeps the foreground handler's « am I already on this screen » test current. */
export function usePushPathname(): void {
  const pathname = usePathname();
  useEffect(() => {
    setCurrentPathname(pathname);
    return () => setCurrentPathname(null);
  }, [pathname]);
}

/**
 * A push ARRIVING while the app is open is the fourth refresh trigger (after foreground,
 * pull-to-refresh and read invalidation): the bell dot and, for a message, the inbox, update
 * without a poll - the 2026-08-20 design's « no polling » holds.
 */
export function usePushForeground(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.notificationsRoot,
      });
      const data = readPushData(n.request.content);
      if (data?.type === "MESSAGE_RECEIVED") {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.conversationsRoot,
        });
      }
      // CF4-E. A system message (e.g. dispute copy in a thread) arrives with a commandeId
      // but no MESSAGE_RECEIVED push, so the check above alone would miss it. Refresh both
      // the commandes list and the conversation it landed in.
      if (data?.commandeId != null) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.commandesRoot,
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.conversationsRoot,
        });
      }
      // CF4-E. Identity/KYC status changed server-side; refresh everything that reads it.
      if (
        data?.type === "IDENTITY_VERIFIED" ||
        data?.type === "IDENTITY_DOCUMENTS_REQUIRED" ||
        data?.type === "VERIFICATION_REVOKED"
      ) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.identityStatus,
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.connectStatus,
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.me,
        });
      }
    });
    return () => sub.remove();
  }, [queryClient]);
}

/** Responses already routed, by notification identifier, so a re-render cannot route twice. */
const handled = new Set<string>();

/**
 * A TAP, whether it launched the app (`useLastNotificationResponse`) or arrived while it ran
 * (the listener). Waits for `me`: with no session the response is dropped - the user is on the
 * login screen, and routing him into a demande he cannot read would 401.
 */
export function usePushResponse(
  me: MeResponse | null,
  refresh: () => Promise<void>,
): void {
  const queryClient = useQueryClient();
  const last = Notifications.useLastNotificationResponse();
  const [live, setLive] = useState<Notifications.NotificationResponse | null>(
    null,
  );

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(setLive);
    return () => sub.remove();
  }, []);

  const response = live ?? last ?? null;
  const identifier = response?.notification.request.identifier ?? null;

  useEffect(() => {
    if (response === null || identifier === null || me === null) return;
    if (handled.has(identifier)) return;
    handled.add(identifier);
    const data = readPushData(response.notification.request.content);
    if (data === null) return;
    // The last unguarded promise on this path: everything inside handleTap is guarded except the terminal router.push.
    void handleTap(data, me, refresh, queryClient).catch(() => undefined);
  }, [identifier, me, response, refresh, queryClient]);
}

/**
 * Spec §9.5. Mark read (fire-and-forget), switch mode if the notification belongs to the other
 * hat and that hat is enabled, then navigate. Every dead end resolves to `/notifications`: an
 * honest list rather than a screen that 403s.
 */
async function handleTap(
  data: PushData,
  me: MeResponse,
  refresh: () => Promise<void>,
  queryClient: QueryClient,
): Promise<void> {
  if (data.notificationId !== null) {
    void api
      .post<void>(`/notifications/${data.notificationId}/read`, {})
      .then(() =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.notificationsRoot,
        }),
      )
      .catch(() => undefined);
  }

  const target = destinationFor(data);

  if (data.mode !== me.profile.activeMode) {
    const enabled =
      data.mode === "CLIENT"
        ? me.profile.clientEnabled
        : me.profile.repairerEnabled;
    if (!enabled) {
      router.push("/notifications");
      return;
    }
    try {
      // `updateModesSchema`'s fields are each optional, so activeMode alone is a valid body.
      await api.patch<MeResponse>("/users/me/modes", { activeMode: data.mode });
      await refresh();
    } catch {
      router.push("/notifications");
      return;
    }
  }

  router.push((target ?? "/notifications") as never);
}
