/**
 * V9 B1 (final review #2). An API refusal that means « your account state is not what this screen
 * thinks » (`CGU_ACCEPTANCE_REQUIRED`, `CGU_REACCEPT_REQUIRED`) asks the session provider to read
 * `/users/me` again, so the tab gate can send the user to the step he owes. Its own module so `api.ts`
 * and `session.tsx` can both import it without importing each other (as `maintenance-signal.ts`).
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function onSessionStale(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function signalSessionStale(): void {
  for (const listener of listeners) listener();
}
