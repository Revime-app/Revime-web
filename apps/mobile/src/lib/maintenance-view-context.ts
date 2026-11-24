import { createContext } from 'react';
import type { MaintenanceView } from './maintenance';

/**
 * V8 E2 (`FND8-027` (1)): what `MaintenanceGate` is showing, for the help bubbles. The tour draws
 * nothing while the maintenance or re-acceptance screen is up, nor before the first platform status
 * read (`statusKnown`), so a bubble never flashes and then disappears under a blocking screen.
 * Its own module so the tour does not import the gate's screens.
 */
export const MaintenanceViewContext = createContext<{ view: MaintenanceView; statusKnown: boolean }>({
  view: 'none',
  statusKnown: false,
});
