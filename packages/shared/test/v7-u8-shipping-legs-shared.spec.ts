import { describe, expect, it } from 'vitest';
import { grossUpForStripe, splitShippingByLeg } from '../src/index.js';

/**
 * V7 A9 (U8, `DEC7-23`): the delivery total the client pays is split between the outbound and the
 * return leg in proportion to each leg's cost (Q1), so the two prices always add up to the total
 * charged and the charge itself does not change.
 */
describe('V7 U8 shipping split per leg, shared', () => {
  const leg = (carrierLabel: string, costInclTaxCents: number) => ({ carrierLabel, costInclTaxCents });

  it('splits two equal legs in half (production relay pair: 3,72 € + 3,72 € → 7,70 €)', () => {
    const total = grossUpForStripe(372 + 372);
    expect(total).toBe(770);
    expect(splitShippingByLeg(total, { OUTBOUND: leg('Chronopost', 372), RETURN: leg('Chronopost', 372) })).toEqual({
      OUTBOUND: { carrierLabel: 'Chronopost', cents: 385 },
      RETURN: { carrierLabel: 'Chronopost', cents: 385 },
    });
  });

  it('splits two different legs by cost (production home pair: 5,50 € + 6,66 € → 12,60 €)', () => {
    const total = grossUpForStripe(550 + 666);
    expect(total).toBe(1260);
    const split = splitShippingByLeg(total, { OUTBOUND: leg('Chronopost', 550), RETURN: leg('Mondial Relay', 666) });
    expect(split.OUTBOUND).toEqual({ carrierLabel: 'Chronopost', cents: 570 });
    expect(split.RETURN).toEqual({ carrierLabel: 'Mondial Relay', cents: 690 });
  });

  it('always adds up to the total charged, to the cent', () => {
    for (const [out, ret] of [
      [1, 2],
      [333, 334],
      [612, 1025],
      [999, 1],
      [4321, 87],
    ] as const) {
      const total = grossUpForStripe(out + ret);
      const split = splitShippingByLeg(total, { OUTBOUND: leg('A', out), RETURN: leg('B', ret) });
      expect(split.OUTBOUND.cents + split.RETURN.cents).toBe(total);
      expect(split.OUTBOUND.cents).toBeGreaterThanOrEqual(0);
      expect(split.RETURN.cents).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives the whole of a zero total to nobody rather than dividing by zero', () => {
    expect(splitShippingByLeg(0, { OUTBOUND: leg('A', 0), RETURN: leg('B', 0) })).toEqual({
      OUTBOUND: { carrierLabel: 'A', cents: 0 },
      RETURN: { carrierLabel: 'B', cents: 0 },
    });
  });

  it('refuses a total or a cost that is not a non-negative integer', () => {
    expect(() => splitShippingByLeg(77.5, { OUTBOUND: leg('A', 1), RETURN: leg('B', 1) })).toThrow();
    expect(() => splitShippingByLeg(770, { OUTBOUND: leg('A', -1), RETURN: leg('B', 1) })).toThrow();
  });
});
