import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme';
import { ScreenMotif } from '../../src/components/ScreenMotif';
import { Card } from '../../src/components/Card';
import { Chip } from '../../src/components/Chip';
import { MessageRow } from '../../src/components/MessageRow';
import { Button } from '../../src/components/Button';
import { useConversations } from '../../src/lib/queries';
import { useSessionContext } from '../../src/lib/session';
import { useTabBarSpace } from '../../src/lib/use-tab-bar-space';
import { whenLabel } from '../../src/lib/when';
import { RevimeLoader } from '../../src/components/lottie/RevimeLoader';
import { RevimeRefreshScrollView } from '../../src/components/RevimeRefreshScrollView';
import { useTourPage, useTourTarget } from '../../src/tour/use-tour';

type Filter = 'tous' | 'non' | 'lus';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'tous', label: 'Tous' },
  { key: 'non', label: 'Non lus' },
  { key: 'lus', label: 'Lus' },
];

/**
 * The inbox, restyled on 2026-08-20 to the prototype's `Messages.tsx`.
 *
 * It rendered stacked `Card`s with no avatar and a plain empty-state card. The prototype
 * draws a flat `.msg-row` list with a 48pt avatar and an illustrated empty state - and a
 * scan-and-pick list of conversations is a list, not a stack of standalone cards.
 *
 * The filter chips are `ink`, NOT the accent. That is the prototype's own distinction and it
 * is deliberate: `.chip--active` here (`styles.css:284`) versus
 * `.chip--accent.chip--active` on Recherche (`:1039`). Ink switches which SET you are
 * looking at; red narrows WHAT you are looking at.
 */
export default function Messages() {
  const { palette, spacing } = useTheme();
  const router = useRouter();
  const { me } = useSessionContext();
  // NEVER a hardcoded number here. The floating tab bar is absolute at bottom: 0,
  // and a literal 32 is what made the last element of five screens unreachable.
  const bottomSpace = useTabBarSpace();
  const [filter, setFilter] = useState<Filter>('tous');
  const conversations = useConversations();

  // No default mode, on purpose. Guessing CLIENT while `me` is unknown (a failed `/users/me`, S1)
  // hid every conversation where the user is the réparateur and the tab read « Aucune
  // conversation ». With no mode nothing is filtered by role, and the list narrows once `me` loads.
  const activeMode = me?.profile.activeMode;
  const modeConversations = (conversations.data ?? []).filter((c) =>
    activeMode && c.userRole ? c.userRole === activeMode : true,
  );
  const rows = modeConversations.filter((c) =>
    filter === 'non' ? c.unread > 0 : filter === 'lus' ? c.unread === 0 : true,
  );

  // S2: a failed load must never read as an empty inbox, so the empty state and the rows both wait
  // for a successful load. (The tab layout renders nothing while the session loads, so no session
  // check is needed here.)
  const loaded = !conversations.isPending && !conversations.isError;
  // V8 E2: once the list has settled (rows or the empty state), so the chips do not move.
  useTourPage('messages', !conversations.isPending && activeMode !== undefined);
  const titleTarget = useTourTarget('messagesTitle');
  const filtersTarget = useTourTarget('messagesFilters');

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenMotif v={3} variant={activeMode === 'REPAIRER' ? 'navy' : 'accent'} />
      <View style={[styles.header, { borderBottomColor: palette.line }]}>
        <Text {...titleTarget} style={[styles.title, { color: palette.ink }]}>Messages</Text>
      </View>

      <RevimeRefreshScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: bottomSpace,
          // Lets the empty state centre itself vertically. Harmless once there are rows:
          // the content then exceeds the viewport and flexGrow has nothing left to give.
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        onRefresh={() => conversations.refetch()}
      >
        <View {...filtersTarget} style={[styles.chips, { marginBottom: spacing.md }]}>
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              variant="ink"
              active={filter === f.key}
              onPress={() => setFilter(f.key)}
            />
          ))}
        </View>

        {conversations.isPending && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 }}>
            <RevimeLoader variant="fill" size={72} />
          </View>
        )}

        {conversations.isError && (
          <Card>
            <Text style={[styles.cardTitle, { color: palette.ink }]}>
              Impossible de charger vos conversations
            </Text>
            <Text style={[styles.cardBody, { color: palette.muted }]}>
              Vos conversations ne sont pas perdues. Réessayez dans un instant.
            </Text>
            <View style={{ marginTop: spacing.sm }}>
              <Button label="Réessayer" onPress={() => void conversations.refetch()} />
            </View>
          </Card>
        )}

        {loaded && rows.length === 0 && (
          // Text only, centred in whatever space is left below the chips.
          //
          // The prototype puts a 120pt illustration above the copy (`.msg-empty__img`), and
          // that was built and then REMOVED at the owner's request on 2026-08-20: the
          // available art is the `app-hero` device cluster, which reads as a product shot
          // rather than an empty-state cue and drew the eye away from the sentence that
          // actually explains the screen. Deliberate divergence, not an omission.
          //
          // Vertical centring needs BOTH halves: `flexGrow: 1` on the ScrollView's content
          // container so the container fills the viewport, and `flex: 1` here so this block
          // claims what the chips do not use. Either alone leaves the text under the chips.
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: palette.ink }]}>Aucune conversation</Text>
            <Text style={[styles.emptyBody, { color: palette.muted }]}>
              {filter === 'tous'
                ? activeMode === 'REPAIRER'
                  ? 'Vos échanges avec les clients apparaîtront ici.'
                  : 'Vos échanges avec les réparateurs apparaîtront ici.'
                : // A filtered empty list is not an empty inbox, and saying « vos échanges
                  // apparaîtront ici » under an active filter would be wrong: they may
                  // already be there, just not matching.
                  filter === 'non'
                  ? 'Aucun message non lu.'
                  : 'Aucune conversation lue.'}
            </Text>
          </View>
        )}

        {loaded &&
          rows.map((c, i) => (
            <MessageRow
              key={c.id}
              name={c.counterpartName}
              // `?? null` at entry: a new DTO field arrives `undefined` from a stale API.
              avatarUrl={c.avatarUrl ?? null}
              subject={c.subject}
              preview={c.preview}
              time={whenLabel(c.lastMessageAt)}
              unread={c.unread}
              onPress={() => router.push(`/conversation/${c.id}`)}
              last={i === rows.length - 1}
            />
          ))}
      </RevimeRefreshScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingVertical: 16, paddingHorizontal: 18, borderBottomWidth: 1 },
  title: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 24 },
  chips: { flexDirection: 'row', gap: 8 },
  loading: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14 },
  cardTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15 },
  cardBody: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, marginTop: 4 },
  // `flex: 1` claims the leftover space, `justifyContent: center` centres in it. The gap is
  // 6 rather than the prototype's 14: that 14 spaced an illustration from its caption, and
  // between a title and its own subtitle it reads as two unrelated lines.
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 6,
  },
  emptyTitle: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 16 },
  emptyBody: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, textAlign: 'center' },
});
