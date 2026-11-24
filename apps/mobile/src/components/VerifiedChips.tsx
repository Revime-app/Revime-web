import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { IconVerified } from '../icons';
import type { MeResponse } from '@revime/shared';

/**
 * The prototype's verified strip (`styles.css:1310-1327`): green pills stating what has
 * actually been checked.
 *
 * 🛑 EVERY CHIP IS DERIVED, NEVER DECORATIVE. The prototype hardcodes « Identité vérifiée »
 * and « Téléphone vérifié » because its user is a fixture. Here each chip appears only when
 * its own condition holds, so the strip is a claim about this account and nothing else - the
 * badge rule this project applies everywhere else.
 *
 * What that means in production today: an account at `BASIC` renders the chip or chips it has
 * actually earned - 🛑 **and since `CF-D1` (2026-09-04) that may be just ONE of the two**,
 * because `BASIC` is now a verified e-mail OR a verified phone rather than both. This comment
 * used to say « e-mail and phone render for a verified account », which under the OR rule
 * would have read as a promise of two chips where the account has earned one. That is why
 * each chip asks its OWN flag (`me.emailVerified`, `me.phoneVerified`) and not the level:
 * the level can no longer tell you WHICH half was verified. « Identité vérifiée » and
 * « Entreprise vérifiée » render for nobody, because no account can reach `IDENTITY` until
 * `CONNECT_ENABLED`'s four conditions close. An absent chip is the correct output, not a
 * missing feature.
 *
 * Returns null rather than an empty row when nothing is verified, so a brand-new account
 * gets no stray gap under the hero.
 */
export function VerifiedChips({ me }: { me: MeResponse }) {
  const { palette } = useTheme();
  const level = me.profile.verificationLevel;

  const chips: string[] = [];
  if (me.emailVerified) chips.push('E-mail vérifié');
  if (me.phoneVerified) chips.push('Téléphone vérifié');
  // BUSINESS sits above IDENTITY, so a level-3 account has passed the identity check too and
  // earns both chips. Listing them separately rather than as an either/or is the point: they
  // are two different checks, and the client's own spec treats them that way.
  if (level === 'IDENTITY' || level === 'BUSINESS') chips.push('Identité vérifiée');
  if (level === 'BUSINESS') chips.push('Entreprise vérifiée');

  if (chips.length === 0) return null;

  return (
    <View style={styles.row}>
      {chips.map((label) => (
        <View
          key={label}
          style={[styles.chip, { backgroundColor: palette.greenSoft, borderCurve: 'continuous' }]}
        >
          <IconVerified size={13} color={palette.greenDeep} strokeWidth={2.4} />
          <Text style={[styles.label, { color: palette.greenDeep }]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * `flex-wrap` matters once a réparateur earns all four: they do not fit on one line.
   *
   * marginTop is 0, NOT the prototype's 14. In CSS the band's `margin-bottom: 18` and this
   * row's `margin-top: 14` are adjacent-sibling margins and COLLAPSE to 18. React Native
   * does not collapse margins, so keeping the 14 here would render 32pt of gap where the
   * prototype shows 18. The band's own marginBottom supplies the spacing above.
   *
   * marginBottom 22 matches the screen's section rhythm. Without it the chips sat flush
   * against the « MODE » label below - the cramped spacing reported from a device on
   * 2026-08-20. The band's 18 only spaces the row from ABOVE; nothing was spacing it below.
   */
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 22 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 999,
  },
  label: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 12 },
});
