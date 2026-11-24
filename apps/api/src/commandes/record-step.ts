import type { CommandeStep } from '@revime/shared';

/**
 * Append-only event write for a CommandeStepEvent, design §4.2. Called in the SAME
 * transaction as every write that sets `Commande.step`, so the two can never drift
 * apart: a rolled-back step write rolls this back too, and a committed one always has
 * its event. `tx` is typed narrowly (just the one delegate this needs) so callers can
 * pass either `this.prisma` (when the caller's own write is not already transactional)
 * or an interactive transaction's `tx`.
 *
 * Deliberately no try/catch: a failed create must reject and roll back the step write
 * with it, not be swallowed into a step change with no event.
 */
export type RecordStepTx = {
  commandeStepEvent: {
    create(args: { data: { commandeId: string; step: CommandeStep } }): Promise<unknown>;
  };
};

export async function recordStep(
  tx: RecordStepTx,
  commandeId: string,
  step: CommandeStep,
): Promise<void> {
  await tx.commandeStepEvent.create({ data: { commandeId, step } });
}
