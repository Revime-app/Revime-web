import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { NotificationDto } from '@revime/shared';
import { useTheme } from '../src/theme';
import { ScreenMotif } from '../src/components/ScreenMotif';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Card } from '../src/components/Card';
import { NotificationRow } from '../src/components/NotificationRow';
import { useSessionContext } from '../src/lib/session';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '../src/lib/queries';
import { destinationFor } from '../src/lib/notification-destination';
import { RevimeLoader } from '../src/components/lottie/RevimeLoader';
import { RevimeRefreshScrollView } from '../src/components/RevimeRefreshScrollView';

/**
 * The notification centre, from `repareme-web/src/screens/Notifications.tsx`.
 *
 * Four deliberate divergences from the prototype, each in the design's §10:
 *
 *  - `ScreenHeader` rather than the prototype's left-aligned `.topbar` with its 40pt
 *    `--mist` back circle. Every pushed screen in this app uses ScreenHeader, so matching
 *    the prototype here would add a second header style for one screen.
 *  - NO bottom nav. This is a pushed root route, so it covers the tab bar, exactly as
 *    `mes-demandes` and `commandes` do. The prototype shows one because its BottomNav is
 *    fixed on every screen.
 *  - The list is FILTERED BY ACTIVE MODE. The prototype has one screen showing four
 *    client-flavoured rows on both, including « 75 € versés à votre réparateur », which a
 *    réparateur must never read about himself.
 *  - « Tout marquer comme lu » is ADDED. The prototype has no way to clear its own dots.
 */
export default function Notifications() {
  const { palette, accent, spacing } = useTheme();
  const router = useRouter();
  const { me } = useSessionContext();

  // The same default ClientHome uses: an absent session reads as CLIENT rather than
  // rendering nothing, so a cold start shows a list instead of a blank screen.
  const mode = me?.profile.activeMode ?? 'CLIENT';

  const notifications = useNotifications(mode);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead(mode);

  /**
   * ONE `now` for the whole render, threaded into every row. Not state: this screen has no
   * ticking clock, and a refetch re-renders with a fresh one, which is when the labels
   * should move anyway.
   */
  const now = new Date();

  const rows = notifications.data ?? [];
  const unread = rows.filter((n) => !n.read).length;

  /**
   * Marks the row read, then navigates. In that order, and the navigation does NOT wait
   * on the mutation: a slow round trip must not delay the tap.
   *
   * A null target is handled rather than interpolated. Per the design §3.4 these ids
   * carry no foreign key, so nothing structurally prevents one being absent - and
   * `router.push('/commande/null')` is exactly the template-literal-over-a-null defect
   * AGENTS.md records under « A NEW DTO FIELD ARRIVES undefined ».
   */
  const open = (n: NotificationDto) => {
    if (!n.read) markRead.mutate(n.id);
    const target = destinationFor(n);
    if (target !== null) router.push(target);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenMotif v={4} variant={mode === 'REPAIRER' ? 'navy' : 'accent'} />
      {/* onBack is REQUIRED, not polish: ScreenHeader renders an empty spacer without it,
          and this is a pushed screen with no tab bar, so omitting it strands the user. */}
      <ScreenHeader title="Notifications" onBack={() => router.back()} />

      {notifications.isPending ? (
        <View style={styles.loaderContainer}>
          <RevimeLoader variant="fill" size={72} />
        </View>
      ) : (
        <RevimeRefreshScrollView
          contentContainerStyle={{ padding: spacing.lg }}
          onRefresh={() => notifications.refetch()}
        >
          {/* Only when there is something to clear, so it is never a control that does
              nothing. Disabled while in flight, because a double tap would fire two
              identical requests. */}
          {unread > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={() => markAll.mutate()}
              disabled={markAll.isPending}
              style={styles.markAll}
            >
              <Text style={[styles.markAllLabel, { color: accent.accent }]}>
                Tout marquer comme lu
              </Text>
            </Pressable>
          )}

          {notifications.isError && (
            <Text style={[styles.bodyStrong, { color: palette.red }]}>
              Impossible de charger vos notifications. Tirez vers le bas pour réessayer.
            </Text>
          )}

        {!notifications.isPending && !notifications.isError && rows.length === 0 && (
          <Card>
            <Text style={[styles.emptyTitle, { color: palette.ink }]}>Aucune notification</Text>
            {/* Per mode, because what will appear here differs. Neither line claims
                anything the product cannot do. */}
            <Text style={[styles.emptyBody, { color: palette.muted }]}>
              {mode === 'CLIENT'
                ? 'Vous serez prévenu ici dès qu’un réparateur répond à une de vos demandes.'
                : 'Vous serez prévenu ici dès qu’un client accepte une de vos offres.'}
            </Text>
          </Card>
        )}

        <View style={{ gap: spacing.md }}>
          {rows.map((n) => (
            <NotificationRow key={n.id} notification={n} now={now} onPress={() => open(n)} />
          ))}
        </View>
      </RevimeRefreshScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markAll: { alignSelf: 'flex-end', paddingBottom: 12 },
  markAllLabel: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13 },
  body: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14 },
  bodyStrong: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 14 },
  emptyTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15 },
  emptyBody: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, marginTop: 4 },
});
