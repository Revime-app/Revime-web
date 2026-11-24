import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ShieldOff } from 'lucide-react';
import { alertTypeIcon } from '../lib/alert-type-icons';

/** V9 U3 (`DEC9-10` (3)): the failed-revocation alert has its own icon and filter pill. */
describe('V9 U3 alert type in the dashboard', () => {
  it('draws its own icon, not the fallback bell', () => {
    expect(alertTypeIcon('PROVIDER_REVOKE_FAILED')).toBe(ShieldOff);
  });

  it('has a filter pill « Révocations échouées »', () => {
    const src = readFileSync(fileURLToPath(new URL('../components/AlertsFilterToolbar.tsx', import.meta.url)), 'utf8');
    expect(src).toContain(`{ id: 'PROVIDER_REVOKE_FAILED', label: 'Révocations échouées', icon: ShieldOff }`);
  });
});
