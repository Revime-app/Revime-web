import { View, Text, StyleSheet } from 'react-native';
import { type RepairStatus } from '@revime/shared';
import { useTheme } from '../theme';
import { Badge } from './Badge';

/**
 * The client's or réparateur's status chain (design §4.1's `CLIENT_STAGES` /
 * `REPAIRER_STAGES`), rendered as done / current / future.
 *
 * 🛑 A CHAIN, not a badge, and that is the whole reason every one of the viewer's labels
 * can be shown honestly. « Offre sélectionnée — Paiement en attente » names a single row
 * (`Commande.PENDING_PAYMENT`) on its own, but earlier positions in the chain still show
 * as *done* while the current one is *current* - both are true at once.
 *
 * The visual language is deliberately identical to the commande tracking chain in
 * `app/commande/[id].tsx`, because a client meets both and two idioms for one concept is
 * the drift this slice exists to remove.
 *
 * An EXIT (« Annulée », « Remboursée ») replaces the chain rather than marking a
 * position on it: neither is a step toward completion, and rendering them inline would
 * imply the demande is still progressing. A DISPUTE keeps the chain (so the position
 * reached is not lost) but the current dot switches to the danger colour and the badge
 * carries « Litige en cours » (`repairStatus()`'s `disputed`).
 */
export function DemandeProgressChain({ status }: { status: RepairStatus }) {
  const { palette, spacing } = useTheme();

  if (status.exit !== null) {
    return (
      <View style={styles.exit}>
        <Badge label={status.label} tone={status.tone} />
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.xs }}>
      {status.disputed && (
        <View style={{ marginBottom: spacing.xs }}>
          <Badge label={status.label} tone={status.tone} />
        </View>
      )}
      {status.stages.map((label, idx) => {
        const done = idx < status.currentIndex;
        const current = idx === status.currentIndex;
        const last = idx === status.stages.length - 1;
        // The current dot turns danger while a dispute is open - `repairStatus()` keeps
        // `currentIndex` at the position reached before the dispute rather than resetting it.
        const dotColor = current && status.disputed
          ? palette.red
          : done
            ? palette.green
            : current
              ? palette.amber
              : palette.line;

        return (
          <View key={label} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: dotColor }]} />
              {!last && (
                <View style={[styles.connector, { backgroundColor: done ? palette.green : palette.line }]} />
              )}
            </View>
            <Text
              style={[
                styles.label,
                {
                  color: current ? palette.ink : palette.muted,
                  fontFamily: current ? 'GoogleSansFlex_600SemiBold' : 'GoogleSansFlex_400Regular',
                  // Future stages are dimmed rather than hidden: the client asked to see
                  // the whole progression, not only where he currently is.
                  opacity: !done && !current ? 0.45 : 1,
                },
              ]}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  exit: { flexDirection: 'row' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rail: { alignItems: 'center', width: 14 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  connector: { width: 2, flex: 1, minHeight: 14 },
  label: { fontSize: 13, flex: 1, paddingBottom: 4 },
});
