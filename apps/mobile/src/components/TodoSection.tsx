import type { ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { TODO_EMPTY_COPY, todoCopy, type DashboardTodoItem } from '@revime/shared';
import { useTheme } from '../theme';
import { Card } from './Card';
import {
  IconArrowRight,
  IconGrid,
  IconInfo,
  IconMailSend,
  IconSearch,
  IconTick,
  IconWrench,
} from '../icons';

/**
 * CF4-22 « À faire » (+ CF4-26's matching line) on the réparateur Tableau de bord - spec §4.5.
 * Every string comes from `todoCopy` / `TODO_EMPTY_COPY` in `@revime/shared`, where it is
 * unit-tested; this component only lays it out.
 *
 * 🛑 NO SYMBOL GLYPHS. Google Sans Flex has no « ✓ » and no « → » (see `apps/mobile/AGENTS.md`).
 * The empty state's ✓ is `IconTick`, and the CTA's trailing « → » - which the shared copy
 * carries verbatim from the spec - is stripped here and drawn as `IconArrowRight`.
 *
 * MEASURED 2026-09-30 with PIL against the shipped TTFs, from the repo root:
 *   title 14pt bold: « 3 nouvelles demandes correspondent à vos services » 356.0pt,
 *                    « 12 nouvelles … » 361.8pt, « 1 litige est en cours sur une de vos
 *                    réparations » 315.5pt.
 *   body 13pt medium: « Pour voir les demandes qui vous correspondent. » 291.5pt.
 *   Text width = screen - 2x16 scroll padding - 2x16 card padding - 34 icon - 12 gap:
 *   390pt -> 280pt, 375pt -> 265pt. So the longest title AND body each need 2 lines at both
 *   widths (and fit in 2: 362 < 530). Hence `numberOfLines={2}` on both, and the CTA on its own
 *   line under the body rather than beside the title, where it would cost the title ~110pt.
 */

type Props = {
  /** Null while the query has no data (pending or error). */
  items: DashboardTodoItem[] | null;
  isPending: boolean;
  isError: boolean;
  onOpen: (item: DashboardTodoItem) => void;
};

const ICON_FOR: Record<DashboardTodoItem['kind'], typeof IconInfo> = {
  DISPUTE: IconInfo,
  ATTENTION: IconWrench,
  MATCHING: IconSearch,
  CATEGORIES_MISSING: IconGrid,
  // CF4-25. Private requests waiting for his answer: the same send mark as the request itself.
  QUOTE_REQUESTS: IconMailSend,
};

/** « Voir → » -> « Voir »; the arrow is an icon. */
function ctaLabel(cta: string): string {
  return cta.replace(/\s*→\s*$/, '');
}

export function TodoSection({ items, isPending, isError, onOpen }: Props) {
  const { palette } = useTheme();

  let body: ReactNode;
  if (isError) {
    body = (
      <Text style={[styles.body, { color: palette.muted }]}>
        Impossible de charger vos actions. Tirez vers le bas pour réessayer.
      </Text>
    );
  } else if (isPending || items === null) {
    // This screen's not-loaded-yet convention, shared with the stat cells.
    body = <Text style={[styles.title, { color: palette.faint }]}>-</Text>;
  } else if (items.length === 0) {
    body = (
      <View style={styles.row}>
        <View style={[styles.iconBox, { backgroundColor: palette.greenSoft }]}>
          <IconTick size={18} color={palette.greenDeep} strokeWidth={2.2} />
        </View>
        <View style={styles.texts}>
          <Text style={[styles.title, { color: palette.ink }]}>{TODO_EMPTY_COPY.title}</Text>
          <Text style={[styles.body, { color: palette.muted }]} numberOfLines={2}>
            {TODO_EMPTY_COPY.body}
          </Text>
        </View>
      </View>
    );
  } else {
    body = items.map((item, i) => {
      const copy = todoCopy(item);
      const Icon = ICON_FOR[item.kind];
      const alert = item.kind === 'DISPUTE';
      return (
        <Pressable
          key={item.kind}
          accessibilityRole="button"
          accessibilityLabel={`${copy.title}. ${ctaLabel(copy.cta)}`}
          onPress={() => onOpen(item)}
          style={({ pressed }) => [
            styles.row,
            i > 0 && { borderTopWidth: 1, borderTopColor: palette.navySoft, paddingTop: 14, marginTop: 14 },
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <View
            style={[
              styles.iconBox,
              { backgroundColor: alert ? palette.redSoft : palette.navySoft },
            ]}
          >
            <Icon size={18} color={alert ? palette.redDeep : palette.navy} strokeWidth={2} />
          </View>
          <View style={styles.texts}>
            <Text style={[styles.title, { color: palette.ink }]} numberOfLines={2}>
              {copy.title}
            </Text>
            <Text style={[styles.body, { color: palette.muted }]} numberOfLines={2}>
              {copy.body}
            </Text>
            <View style={styles.cta}>
              <Text style={[styles.ctaText, { color: palette.red }]}>{ctaLabel(copy.cta)}</Text>
              <IconArrowRight size={14} color={palette.red} strokeWidth={2.2} />
            </View>
          </View>
        </Pressable>
      );
    });
  }

  return (
    <>
      <Text style={[styles.eyebrow, { color: palette.faint }]}>À FAIRE</Text>
      <Card>{body}</Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconBox: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1 },
  title: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 14, lineHeight: 19 },
  body: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, lineHeight: 18, marginTop: 2 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    marginTop: 6,
  },
  ctaText: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 13 },
  /** Same as the dashboard's own `.eyebrow`. */
  eyebrow: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 11,
    letterSpacing: 1.6,
    marginTop: 22,
    marginBottom: 10,
  },
});
