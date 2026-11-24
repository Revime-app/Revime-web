import { View, Text, Pressable, StyleSheet } from 'react-native';
import {
  activityCopy,
  timeAgoLabel,
  type DashboardActivityItem,
} from '@revime/shared';
import { useTheme } from '../theme';
import { Card } from './Card';
import {
  IconBriefcase,
  IconCreditCard,
  IconInfo,
  IconStar,
  IconTick,
} from '../icons';

/**
 * CF4-23 « Activité récente » on the réparateur Tableau de bord - spec §4.5. Up to 5 rows
 * (the server cuts), tap -> the commande. Renders NOTHING for `[]`, the same rule as the
 * rating block below it: an empty « activité » card reads as a broken feed.
 *
 * Line copy is `activityCopy` from `@revime/shared` (unit-tested); the second line is the
 * demande title, single-line with an ellipsis because it is user text of any length.
 */

type Props = {
  items: DashboardActivityItem[];
  /** One `now` per render, so every row's « il y a … » is relative to the same instant. */
  now: Date;
  onOpen: (commandeId: string) => void;
};

const ICON_FOR: Record<DashboardActivityItem['kind'], typeof IconInfo> = {
  OFFER_ACCEPTED: IconBriefcase,
  REPAIR_DONE: IconTick,
  FUNDS_RELEASED: IconCreditCard,
  REVIEW_RECEIVED: IconStar,
  DISPUTE_OPENED: IconInfo,
};

export function ActivityList({ items, now, onOpen }: Props) {
  const { palette } = useTheme();
  if (items.length === 0) return null;

  return (
    <>
      <Text style={[styles.eyebrow, { color: palette.faint }]}>ACTIVITÉ RÉCENTE</Text>
      <Card>
        {items.map((item, i) => {
          const Icon = ICON_FOR[item.kind];
          const line = activityCopy(item);
          const when = timeAgoLabel(item.at, now);
          return (
            <Pressable
              key={`${item.kind}:${item.commandeId}:${item.at}`}
              accessibilityRole="button"
              accessibilityLabel={`${line}, ${item.subject}${when ? `, ${when}` : ''}`}
              onPress={() => onOpen(item.commandeId)}
              style={({ pressed }) => [
                styles.row,
                i > 0 && { borderTopWidth: 1, borderTopColor: palette.navySoft, paddingTop: 12, marginTop: 12 },
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <View
                style={[
                  styles.iconBox,
                  {
                    backgroundColor:
                      item.kind === 'DISPUTE_OPENED' ? palette.redSoft : palette.navySoft,
                  },
                ]}
              >
                <Icon
                  size={16}
                  color={item.kind === 'DISPUTE_OPENED' ? palette.redDeep : palette.navy}
                  strokeWidth={2}
                />
              </View>
              <View style={styles.texts}>
                <Text style={[styles.line, { color: palette.ink }]} numberOfLines={1}>
                  {line}
                </Text>
                <Text style={[styles.subject, { color: palette.muted }]} numberOfLines={1}>
                  {item.subject}
                </Text>
              </View>
              {when !== null && (
                <Text style={[styles.when, { color: palette.faint }]} numberOfLines={1}>
                  {when}
                </Text>
              )}
            </Pressable>
          );
        })}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1 },
  line: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 14 },
  subject: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12.5, marginTop: 1 },
  when: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12 },
  eyebrow: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 11,
    letterSpacing: 1.6,
    marginTop: 22,
    marginBottom: 10,
  },
});
