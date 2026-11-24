import { describe, expect, it } from 'vitest';
import { ADMIN_ALERT_TYPE_LABELS, ADMIN_ALERT_TYPES } from '../src/index.js';

/** V9 U3 (`DEC9-10` (3)): « Révocation Apple / Google échouée », severity MEDIUM. */
describe('V9 U3 alert type', () => {
  it('is a known alert type with its label', () => {
    expect(ADMIN_ALERT_TYPES).toContain('PROVIDER_REVOKE_FAILED');
    expect(ADMIN_ALERT_TYPE_LABELS.PROVIDER_REVOKE_FAILED).toMatchObject({
      label: 'Révocation Apple / Google échouée',
      defaultSeverity: 'MEDIUM',
    });
  });
});
