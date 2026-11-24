import { describe, expect, it } from 'vitest';
import { DISPUTE_RESPONSE_TEMPLATES } from '../src/admin.schemas';

// RU-22 · P18. The templates go to customers under Revime's name: they must not promise what
// the platform does not do (a commission, a final decision on a clock).
describe('dispute response templates', () => {
  const arbitration = DISPUTE_RESPONSE_TEMPLATES.find((t) => t.category === 'ARBITRATION_NOTICE')!;

  it('names no arbitration commission and sets no decision deadline', () => {
    expect(arbitration.body).not.toMatch(/commission/i);
    expect(arbitration.body).not.toMatch(/irrévocable/i);
    expect(arbitration.body).not.toMatch(/sous 24 heures/i);
  });

  it('still tells the party what the decision decides', () => {
    expect(arbitration.body).toContain('fonds actuellement séquestrés');
  });
});
