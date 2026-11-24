import { describe, it, expect } from 'vitest';
import { ADMIN_ALERT_TYPE_LABELS, ADMIN_ALERT_TYPES } from '@revime/shared';
import { ALERT_TYPE_ICON, alertTypeIcon } from '../lib/alert-type-icons';

// ISS-123: the shared label map still carries the emoji (the API reads it); the admin draws its
// own Lucide icon per alert type, so a type added to the shared enum must get one here.
describe('alert type icons', () => {
  it('has an icon for every alert type the shared package defines', () => {
    for (const t of ADMIN_ALERT_TYPES) {
      expect(ALERT_TYPE_ICON[t], t).toBeDefined();
      expect(Object.keys(ADMIN_ALERT_TYPE_LABELS)).toContain(t);
    }
  });

  it('gives each type its own icon, so two alert types never look alike', () => {
    const icons = ADMIN_ALERT_TYPES.map((t) => ALERT_TYPE_ICON[t]);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('falls back to a bell for a type the admin does not know yet', () => {
    expect(alertTypeIcon('SOMETHING_NEW')).toBe(alertTypeIcon('ANOTHER_ONE'));
    expect(alertTypeIcon('SOMETHING_NEW')).toBeDefined();
  });
});
