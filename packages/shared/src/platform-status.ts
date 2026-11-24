import { z } from 'zod';
import { isStaffRole } from './admin-permissions.js';

/**
 * V7 D5 (U9, `DEC7-24`). What `GET /platform/status` tells anyone, signed in or not: only what the
 * app needs to decide whether to show the maintenance screen. The rest of `PlatformSettings` (fees,
 * delays, carriers) is not public and stays behind `/admin/settings`.
 */
export const platformStatusSchema = z.object({
  maintenance: z.object({
    enabled: z.boolean(),
    message: z.string(),
  }),
  /**
   * V7 D5 (U9b). The active CGU version and whether re-acceptance is forced; optional so an app reads
   * an API older than U9b as « nothing to accept ». `summary` and `publishedAt` come from the
   * version's row, and are null if that row is missing.
   */
  cgu: z
    .object({
      version: z.string(),
      forceReaccept: z.boolean(),
      summary: z.string().nullable(),
      publishedAt: z.string().nullable(),
    })
    .optional(),
  legalNotice: z.object({ version: z.string() }).optional(),
});
export type PlatformStatus = z.infer<typeof platformStatusSchema>;

export const MAINTENANCE_TITLE = 'Maintenance en cours';
export const MAINTENANCE_STAFF_BANNER = "Mode maintenance actif : seule l'équipe a accès.";

/** Q3: how often the app re-reads the status while in use, and while the screen is up (so it lifts by itself). */
export const MAINTENANCE_POLL_IN_USE_MS = 5 * 60_000;
export const MAINTENANCE_POLL_ON_SCREEN_MS = 60_000;

/**
 * The one rule, for the app's screen and the API's refusal alike: maintenance on blocks everyone
 * except the six staff roles (Q3). An unknown status blocks nobody (Q4, fail open).
 */
export function maintenanceBlocks(status: PlatformStatus | null, role: string | null | undefined): boolean {
  return status?.maintenance.enabled === true && !isStaffRole(role);
}

/**
 * V7 D5 (U9b, `DEC7-24` Q7, Q13). With « Forcer la réacceptation » ticked, a signed-in user whose
 * accepted version is not the active one must accept before continuing, staff included (in the app;
 * the API exempts the dashboard's routes). A signed-out visitor, or an unknown status, is never forced.
 */
export function cguReacceptRequired(
  status: PlatformStatus | null,
  user: { cguVersion?: string | null } | null | undefined,
): boolean {
  if (!user || !status?.cgu?.forceReaccept) return false;
  return (user.cguVersion ?? null) !== status.cgu.version;
}
