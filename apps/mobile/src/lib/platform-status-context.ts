import { createContext, useContext } from 'react';
import type { PlatformStatus } from '@revime/shared';

/**
 * V7 D5 (U9b). The platform status `MaintenanceGate` already reads, shared with screens that need it
 * (the in-app legal reader's « newer version » line) so they do not poll the route again. Null until
 * the first read succeeds, and outside the gate.
 */
export const PlatformStatusContext = createContext<PlatformStatus | null>(null);

export function usePlatformStatus(): PlatformStatus | null {
  return useContext(PlatformStatusContext);
}
