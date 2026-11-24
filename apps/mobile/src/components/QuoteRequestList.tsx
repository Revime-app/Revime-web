import { View, Text, Pressable, StyleSheet } from 'react-native';
import { publicIdentity, quoteBadge, repairerQuoteRequestLabel, type RepairerQuoteRequestItem } from '@revime/shared';
import { useTheme } from '../theme';
import { Card } from './Card';
import { Badge } from './Badge';
import { IconChevronRight, IconMailSend } from '../icons';
import { RevimeLoader } from './lottie/RevimeLoader';

type Props = {
  items: RepairerQuoteRequestItem[] | undefined;
  isPending: boolean;
  isError: boolean;
  onOpen: (demandeId: string) => void;
  /** Shown when the list resolved empty. */
  emptyLabel: string;
};

/**
 * CF4-25. The réparateur's private quote requests - the Tableau de bord's « Demandes de devis »
 * section and the `devis-recus` screen. Row copy comes from `repairerQuoteRequestLabel` in
 * `@revime/shared`, where it is unit-tested.
 *
 * 🛑 An error renders as an error, never as the empty line: until the H API half is deployed,
 * `repairers/me/quote-requests` 404s, and « Aucune demande » would be a false claim.
 */
export function QuoteRequestList({ items, isPending, isError, onOpen, emptyLabel }: Props) {
  const { palette, spacing, accent } = useTheme();

  if (isPending) {
    return (
      <View style={{ paddingVertical: 16, alignItems: 'center', justifyContent: 'center' }}>
        <RevimeLoader variant="fill" size={64} />
      </View>
    );
  }
  if (isError) {
    return (
      <Text style={[styles.meta, { color: palette.red }]}>
        Impossible de charger les demandes de devis.
      </Text>
    );
  }
  if (!items || items.length === 0) {
    return (
      <Card>
        <Text style={[styles.meta, { color: palette.muted }]}>{emptyLabel}</Text>
      </Card>
    );
  }
  return (
    <View style={{ gap: spacing.sm }}>
      {items.map((item) => (
        <Pressable
          key={item.demandeId}
          onPress={() => onOpen(item.demandeId)}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}, ${repairerQuoteRequestLabel(item)}`}
        >
          <Card>
            <View style={styles.row}>
              <View style={[styles.icon, { backgroundColor: accent.accentSoft }]}>
                <IconMailSend size={18} color={accent.accent} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: palette.ink }]} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={[styles.meta, { color: palette.muted }]} numberOfLines={1}>
                  {publicIdentity({ username: item.clientName, displayName: null })}
                </Text>
                {(() => {
                  const badge = quoteBadge({
                    status: item.status,
                    hasLiveQuote: item.liveQuote !== null,
                    closedReason: item.closedReason,
                    viewer: 'REPAIRER',
                  });
                  const detail = repairerQuoteRequestLabel(item);
                  return (
                    <>
                      <View style={{ marginTop: 4, alignSelf: 'flex-start' }}>
                        <Badge label={badge.label} tone={badge.tone} />
                      </View>
                      {detail !== badge.label && (
                        <Text style={[styles.status, { color: palette.ink2, marginTop: 4 }]} numberOfLines={2}>
                          {detail}
                        </Text>
                      )}
                    </>
                  );
                })()}
              </View>
              <IconChevronRight size={18} color={palette.faint} strokeWidth={2} />
            </View>
          </Card>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 14 },
  meta: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, marginTop: 2 },
  status: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12.5, marginTop: 4 },
});
