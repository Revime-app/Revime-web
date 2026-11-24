import { describe, expect, it } from 'vitest';
import { notificationCopy } from '../src/index.js';

/**
 * V8 `ISS8-020` (b), seen on the emulator 2026-11-18: « 1 € débloqués pour votre réparateur ». In French an
 * amount below 2 € takes the singular (« 1 € débloqué », « 1,50 € débloqué »), from 2 € the plural. The
 * réparateur's « X versés sur votre compte » in the same notification had the same flaw.
 */
const client = (amountCents: number) => notificationCopy({ type: 'FUNDS_RELEASED', mode: 'CLIENT', amountCents, subject: null }).sub;
const repairer = (amountCents: number) => notificationCopy({ type: 'FUNDS_RELEASED', mode: 'REPAIRER', amountCents, subject: null }).sub;

describe('FUNDS_RELEASED agrees with its amount (ISS8-020 (b))', () => {
  it('singular below 2 €, for the client', () => {
    expect(client(100)).toBe('1 € débloqué pour votre réparateur');
    expect(client(150)).toBe('1,50 € débloqué pour votre réparateur');
  });

  it('plural from 2 €, for the client', () => {
    expect(client(200)).toBe('2 € débloqués pour votre réparateur');
    expect(client(7500)).toBe('75 € débloqués pour votre réparateur');
  });

  it('the same rule for the réparateur', () => {
    expect(repairer(100)).toBe('1 € versé sur votre compte');
    expect(repairer(7500)).toBe('75 € versés sur votre compte');
  });
});
