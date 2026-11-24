import { describe, expect, it } from 'vitest';
import {
  ADMIN_ROLES,
  API_ERROR_CODES,
  MAINTENANCE_POLL_IN_USE_MS,
  MAINTENANCE_POLL_ON_SCREEN_MS,
  MAINTENANCE_STAFF_BANNER,
  MAINTENANCE_TITLE,
  maintenanceBlocks,
  platformStatusSchema,
  type PlatformStatus,
} from '../src/index.js';

/**
 * V7 D5 (U9, `DEC7-24`): maintenance mode. One rule for the app's screen and the API's refusal:
 * maintenance on blocks everyone but the six staff roles.
 */
describe('V7 U9 maintenance, shared', () => {
  const on: PlatformStatus = { maintenance: { enabled: true, message: 'De retour à 18 h.' } };
  const off: PlatformStatus = { maintenance: { enabled: false, message: 'De retour à 18 h.' } };

  it('blocks a client, a réparateur and a signed-out visitor while maintenance is on', () => {
    expect(maintenanceBlocks(on, null)).toBe(true);
    expect(maintenanceBlocks(on, undefined)).toBe(true);
    expect(maintenanceBlocks(on, 'user')).toBe(true);
  });

  it('lets every one of the six staff roles through (Q3)', () => {
    expect(ADMIN_ROLES).toHaveLength(6);
    for (const role of ADMIN_ROLES) expect(maintenanceBlocks(on, role)).toBe(false);
  });

  it('blocks nobody when maintenance is off, or when the status is unknown (fail open, Q4)', () => {
    expect(maintenanceBlocks(off, null)).toBe(false);
    expect(maintenanceBlocks(null, null)).toBe(false);
  });

  it('parses the public status and refuses a malformed one', () => {
    expect(platformStatusSchema.parse(on)).toEqual(on);
    expect(platformStatusSchema.safeParse({ maintenance: { enabled: 'yes' } }).success).toBe(false);
  });

  it('carries the agreed wording, cadence and error code', () => {
    expect(MAINTENANCE_TITLE).toBe('Maintenance en cours');
    expect(MAINTENANCE_STAFF_BANNER).toBe("Mode maintenance actif : seule l'équipe a accès.");
    expect(MAINTENANCE_POLL_IN_USE_MS).toBe(5 * 60_000);
    expect(MAINTENANCE_POLL_ON_SCREEN_MS).toBe(60_000);
    expect(API_ERROR_CODES).toContain('MAINTENANCE');
  });
});
