import { describe, expect, it } from 'vitest';
import { grossUpForStripe, SHIPPING_STRIPE_RATE_BP } from '@revime/shared';

describe('grossUpForStripe', () => {
  it('is the measured non-EEA rate, the conservative one (Q4)', () => {
    expect(SHIPPING_STRIPE_RATE_BP).toBe(325);
  });

  it("prices the spike's phone relay-to-relay pair at 7,80 € and its insurance at 15,20 €", () => {
    // 3,78 + 3,72 = 7,50 → 7,50 / 0,9675 = 7,752 → up to 7,80.
    expect(grossUpForStripe(750)).toBe(780);
    // 7,34 × 2 = 14,68 → 15,173 → up to 15,20.
    expect(grossUpForStripe(1468)).toBe(1520);
  });

  it('rounds UP to the next 10 cents, and leaves an exact multiple alone', () => {
    expect(grossUpForStripe(0)).toBe(0);
    // 9675 / 0,9675 = 10000 exactly.
    expect(grossUpForStripe(9675)).toBe(10_000);
    // One cent more must cross to the next 10.
    expect(grossUpForStripe(9676)).toBe(10_010);
  });

  it('covers the fee on itself: result × (1 − rate) ≥ cost for every input in a sweep', () => {
    for (let cost = 0; cost <= 20_000; cost += 7) {
      const price = grossUpForStripe(cost);
      expect(price * (10_000 - SHIPPING_STRIPE_RATE_BP)).toBeGreaterThanOrEqual(cost * 10_000);
      expect(price % 10).toBe(0);
    }
  });

  it('is monotonic non-decreasing', () => {
    let last = 0;
    for (let cost = 0; cost <= 5_000; cost += 1) {
      const price = grossUpForStripe(cost);
      expect(price).toBeGreaterThanOrEqual(last);
      last = price;
    }
  });

  it('throws on a negative, a non-integer and NaN, because a wrong shipping price is money', () => {
    expect(() => grossUpForStripe(-1)).toThrow();
    expect(() => grossUpForStripe(12.5)).toThrow();
    expect(() => grossUpForStripe(Number.NaN)).toThrow();
  });
});
