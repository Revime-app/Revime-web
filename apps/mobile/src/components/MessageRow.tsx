import { Pressable, View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { Initials } from './Initials';

/**
 * The prototype's `.msg-row` (`styles.css:1099-1135`): a 48pt avatar, then a three-line body
 * - name with the time on the same baseline, the demande subject, then the preview with an
 * unread badge - separated by a hairline rather than wrapped in a card.
 *
 * A sibling of `ResultRow` rather than a reuse of it: that one is icon + title + tag +
 * chevron, this one is avatar + three lines + badge and no chevron. Sharing them would mean a
 * component with two mutually exclusive halves.
 *
 * 🛑 THIS USED TO SAY THE AVATAR COULD ONLY EVER BE INITIALS, because `Profile.avatarPath` was a
 * column the API never read. `CF-23` (2026-08-30) built the uploader, so `Initials` renders the
 * counterpart's photo when they have one and their initials when they do not. It is sized 48 at
 * radius 14 to match the prototype's `.avatar`, which `Initials` supports without changing its
 * default circle - so a photo here is a rounded square, as the prototype draws it.
 */
type Props = {
  name: string;
  /**
   * The COUNTERPART's photo, or null. An inbox row shows who you are talking to, so the server
   * resolves which side this is (`counterpartAvatarPath`) rather than the screen guessing.
   */
  avatarUrl: string | null;
  /** The demande the conversation is about. */
  subject: string;
  preview: string;
  /** Relative time, already formatted by the caller. */
  time: string;
  unread: number;
  onPress: () => void;
  /** The last row omits its hairline, so the list does not end on a dangling rule. */
  last?: boolean;
};

export function MessageRow({
  name,
  avatarUrl,
  subject,
  preview,
  time,
  unread,
  onPress,
  last = false,
}: Props) {
  const { palette, accent, radii } = useTheme();
  const hasUnread = unread > 0;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          // `.msg-row:active { background: var(--mist) }`.
          backgroundColor: pressed ? palette.mist : 'transparent',
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: palette.line,
        },
      ]}
    >
      <Initials name={name} uri={avatarUrl} size={48} radius={14} />

      {/* `.msg-row__body { flex: 1; min-width: 0 }` - minWidth 0 is what lets the name
          ellipsise instead of pushing the timestamp off the row. */}
      <View style={styles.body}>
        <View style={styles.topLine}>
          <Text style={[styles.name, { color: palette.ink }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.time, { color: palette.muted }]}>{time}</Text>
        </View>

        <Text style={[styles.subject, { color: palette.muted }]} numberOfLines={1}>
          {subject}
        </Text>

        <View style={styles.bottomLine}>
          <Text
            style={[
              styles.preview,
              {
                // Not in the prototype, kept on purpose: the badge says HOW MANY are unread,
                // the weight says WHICH ROW to look at while scanning. They answer different
                // questions.
                fontFamily: hasUnread ? 'GoogleSansFlex_600SemiBold' : 'GoogleSansFlex_400Regular',
                color: hasUnread ? palette.ink : palette.muted,
              },
            ]}
            numberOfLines={1}
          >
            {preview}
          </Text>
          {hasUnread && (
            <View
              style={[styles.badge, { backgroundColor: accent.accent, borderRadius: radii.pill }]}
            >
              <Text style={[styles.badgeLabel, { color: palette.paper }]}>{unread}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // `gap: 13px; padding: 14px 4px`.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  body: { flex: 1, minWidth: 0 },
  topLine: { flexDirection: 'row', alignItems: 'baseline' },
  name: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 14.5, flex: 1 },
  time: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 11.5, paddingLeft: 8 },
  subject: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12 },
  bottomLine: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  // `.msg-row__preview`: 13px muted, ellipsised.
  preview: { fontSize: 13, flex: 1 },
  // `.msg-badge`: min-width 20 AND height 20, so 1 and 12 render the same pill rather than
  // one being a circle and the other a taller lozenge.
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  badgeLabel: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 11 },
});
