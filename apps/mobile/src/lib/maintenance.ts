import {
  MAINTENANCE_POLL_IN_USE_MS,
  MAINTENANCE_POLL_ON_SCREEN_MS,
  cguReacceptRequired,
  isStaffRole,
  maintenanceBlocks,
  type PlatformStatus,
} from '@revime/shared';

export type MaintenanceView = 'screen' | 'reaccept' | 'banner' | 'none';

/**
 * V7 D5 (U9, `DEC7-24`). What the gate draws:
 * - `none` while maintenance is off or the status is unknown (Q4, fail open);
 * - `banner` for a team member, who keeps full access (Q3, Q5);
 * - `none` on the login screens after « Connexion équipe » (Q1), so a team member can sign in;
 * - `screen` for everyone else, including a non-staff account that just signed in there.
 *
 * U9b (`DEC7-24` Q7, Q13): after maintenance, `reaccept` for a signed-in user, staff included, whose
 * accepted CGU version is not the active one while re-acceptance is forced; it steps aside on the
 * deletion screen after « Supprimer mon compte » (`DEC7-25` Q1), like `screen` for the team login.
 */
export function maintenanceView(input: {
  status: PlatformStatus | null;
  role: string | null | undefined;
  teamLogin: boolean;
  inAuthGroup: boolean;
  signedIn?: boolean;
  cguVersion?: string | null;
  deleteFlow?: boolean;
  inDeleteRoute?: boolean;
}): MaintenanceView {
  const maintenanceOn = input.status?.maintenance.enabled === true;
  if (maintenanceOn && !isStaffRole(input.role) && !(input.teamLogin && input.inAuthGroup)) {
    return maintenanceBlocks(input.status, input.role) ? 'screen' : 'none';
  }
  // V9 B1 (`FND9-017`): an account that has never accepted anything is not asked to accept « again »;
  // its own terms screen (`/(auth)/conditions`, from `tabGateTarget`) owns it.
  const reaccept =
    input.signedIn === true &&
    (input.cguVersion ?? null) !== null &&
    cguReacceptRequired(input.status, { cguVersion: input.cguVersion ?? null }) &&
    !(input.deleteFlow === true && input.inDeleteRoute === true);
  if (reaccept) return 'reaccept';
  return maintenanceOn && isStaffRole(input.role) ? 'banner' : 'none';
}

/**
 * True when the screen has just gone. While it was up the server refused `/users/me` (once
 * `PLATFORM_GATES_ENFORCED` is on), and the session keeps its previous `me` on a failed read, so an
 * app opened during maintenance has none: the gate reloads the session once, here.
 */
export function liftedFromScreen(previous: MaintenanceView | null, next: MaintenanceView): boolean {
  return previous === 'screen' && next !== 'screen';
}

/**
 * The timed half of Q3: one read at `start`, then one every 5 minutes in use, or every 60 seconds
 * while the screen is up so it lifts by itself; `refresh` reads at once (return to the foreground,
 * « Réessayer », a `MAINTENANCE` answer). A failed read changes nothing: before any answer the app
 * stays open (Q4), after one it keeps the last answer rather than flickering on a bad network.
 * Plain timers, no React, so it is tested on its own and the gate only wires it.
 */
export function createMaintenanceWatcher(deps: {
  fetchStatus: () => Promise<PlatformStatus>;
  onChange: (status: PlatformStatus) => void;
}) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let onScreen = false;
  let stopped = true;

  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = stopped ? null : setTimeout(refresh, onScreen ? MAINTENANCE_POLL_ON_SCREEN_MS : MAINTENANCE_POLL_IN_USE_MS);
  };

  function refresh(): void {
    if (stopped) return;
    deps
      .fetchStatus()
      .then((status) => {
        if (!stopped) deps.onChange(status);
      })
      .catch(() => {})
      .finally(schedule);
  }

  return {
    start() {
      stopped = false;
      refresh();
    },
    refresh,
    setOnScreen(next: boolean) {
      if (next === onScreen) return;
      onScreen = next;
      schedule();
    },
    stop() {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
