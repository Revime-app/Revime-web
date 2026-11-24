import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTourTarget } from '../tour/use-tour';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme';
import { IconNotification } from '../icons';
import { useUnreadNotifications } from '../lib/queries';
import { BrandWordmark } from './BrandWordmark';

/**
 * 24pt tall, so 135pt wide. Leaves the mode pill comfortable room on a 320pt screen.
 *
 * The asset, its aspect ratio and the reason both axes must be set explicitly all moved to
 * `BrandWordmark` on 2026-08-21, when onboarding and the three auth screens stopped drawing
 * the wordmark as live text and started showing the same image this header does. That rule
 * had already been written twice in this repo and got wrong once, so it now has exactly one
 * home - read it there before changing anything about the logo's size.
 */
const LOGO_HEIGHT = 24;

/**
 * The prototype's app header: the brand lockup, a mode pill, and the bell
 * (`Accueil.tsx:21-43`, `AccueilPro.tsx:14-30`).
 *
 * This block used to say « DELIBERATELY NO BELL … add it in the slice that builds
 * notifications, not before ». That slice is done, so the bell is here and it routes to
 * `/notifications`, which now exists.
 *
 * It takes NO new props and reads its own unread count, consistent with
 * `VerificationBanner` directly beneath it in both homes: both call sites render this
 * component with `mode` alone and neither needed changing.
 *
 * The wordmark WAS live text - « Revi » in ink plus « me » in red, 700 at 20pt. Replaced
 * with the delivered logo, which is not a like-for-like swap in two ways worth knowing:
 *
 * 1. **The lockup includes the interlocking mark**, so the header now carries the icon
 *    the text version had no way to show. That is why it reads larger at the same height.
 * 2. **The logo does NOT repaint by mode.** Its red half stays red in réparateur mode,
 *    where `accent.accent` is navy and everything else on the screen follows. That is
 *    correct - a brand mark is not themed - but this app repaints accents by mode
 *    everywhere else, so it is recorded here rather than left to look like an oversight.
 *
 * 🛑 **`accessibilityLabel` is not decoration.** Swapping text for an image silently
 * removes the only thing a screen reader had to announce, and an unlabelled `Image` is
 * skipped or read as a filename. The label restores what the `Text` gave for free.
 *
 * STILL NO AVATAR, though the prototype's réparateur header has one (`AccueilPro.tsx:28`) - but
 * 🛑 THE REASON CHANGED WITH `CF-23` AND THE OLD ONE MUST NOT BE REUSED. This used to say
 * `Profile.avatarPath` was a column nothing uploads to and `STORAGE_DRIVER` was absent, so a header
 * avatar could only ever be a placeholder. Both halves are now false: the column has an uploader,
 * and `STORAGE_DRIVER` is `supabase` in production.
 *
 * So this is now a SCOPE decision rather than an impossibility: `CF-23` was scoped to the profile
 * editor and the four surfaces that show other people (annuaire, fiche publique, messages, own
 * profile header). Adding one here is a live option nobody has asked for, not a blocked one - if it
 * is ever wanted, `MeResponse.avatarUrl` already carries it and `Initials` already renders it.
 *
 * The pill reads the ACTIVE MODE rather than being hardcoded « Client », so the
 * réparateur branch could reuse this without the label lying. It is indicative only:
 * mode is switched from Profil, and making the pill a control would give the app two
 * places that own the same state.
 */
export function BrandHeader({ mode }: { mode: 'CLIENT' | 'REPAIRER' }) {
  const { palette, accent, spacing, radii } = useTheme();
  const router = useRouter();

  // Errors and the pending state both leave `count` at 0, so the dot fails CLOSED: a
  // failed count must not draw attention to notifications that may not exist.
  const unread = useUnreadNotifications(mode).data?.count ?? 0;
  // V8 E2: Accueil's « Vos notifications » bubble (both modes).
  const bellTarget = useTourTarget('bell');

  return (
    <View style={[styles.header, { backgroundColor: palette.paper, paddingHorizontal: spacing.lg }]}>
      <View style={styles.brandRow}>
        <BrandWordmark height={LOGO_HEIGHT} />
        <View
          style={[
            styles.pill,
            { backgroundColor: accent.accentSoft, borderColor: accent.accent, borderRadius: radii.pill },
          ]}
        >
          <Text style={[styles.pillLabel, { color: accent.accent }]}>
            {mode === 'CLIENT' ? 'Client' : 'Réparateur'}
          </Text>
        </View>
      </View>

      <Pressable
        {...bellTarget}
        accessibilityRole="button"
        accessibilityLabel={
          // The label carries the COUNT, because a screen reader gets nothing from an
          // 8pt dot.
          unread > 0 ? `Notifications, ${unread} non lue${unread > 1 ? 's' : ''}` : 'Notifications'
        }
        onPress={() => router.push('/notifications')}
        style={styles.bell}
      >
        <IconNotification size={22} color={palette.ink} strokeWidth={2.2} />
        {/* `palette.red` in BOTH modes, matching the row dots inside the screen: « unread »
            is not a brand accent, and a navy dot on a navy-soft tile would be invisible. */}
        {unread > 0 && <View style={[styles.dot, { backgroundColor: palette.red }]} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingBottom: 4,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1 },
  pillLabel: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 11.5 },
  // 40x40 around a 22pt glyph: a bare icon is below the comfortable tap target.
  bell: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  // Absolutely positioned so the glyph does not shift when the dot appears.
  dot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4 },
});
