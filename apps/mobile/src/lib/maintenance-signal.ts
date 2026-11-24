/**
 * V7 D5 (U9, `DEC7-24` Q3). Any API call answered `MAINTENANCE` (or, since U9b,
 * `CGU_REACCEPT_REQUIRED`) tells the maintenance gate at once,
 * so the screen does not wait for the next timed read. Its own module so `api.ts` and the gate can
 * both import it without importing each other.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function onMaintenanceAnswer(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function signalMaintenanceAnswer(): void {
  for (const listener of listeners) listener();
}
