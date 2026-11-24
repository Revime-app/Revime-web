import { describe, expect, it } from 'vitest';
import { distanceKm } from '../src/geo/haversine.js';

const paris = { lat: 48.8566, lng: 2.3522 };
const lyon = { lat: 45.764, lng: 4.8357 };

describe('distanceKm', () => {
  it('matches the known Paris–Lyon great-circle distance', () => {
    // ~392 km. Tolerance is wide enough for earth-radius choice, tight enough
    // that a wrong formula (degrees vs radians, swapped lat/lng) fails.
    expect(distanceKm(paris, lyon)).toBeGreaterThan(385);
    expect(distanceKm(paris, lyon)).toBeLessThan(400);
  });

  it('is zero for the same point', () => {
    expect(distanceKm(paris, paris)).toBe(0);
  });

  it('is symmetric', () => {
    expect(distanceKm(paris, lyon)).toBeCloseTo(distanceKm(lyon, paris)!, 6);
  });

  it('returns null when either end is unlocated', () => {
    expect(distanceKm(null, lyon)).toBeNull();
    expect(distanceKm(paris, null)).toBeNull();
    expect(distanceKm(null, null)).toBeNull();
  });

  it('does not confuse latitude with longitude', () => {
    // Swapping the fields of Lyon must change the answer. Without this, a
    // formula that reads the wrong field still passes the Paris–Lyon check by
    // coincidence of magnitudes.
    const swapped = { lat: lyon.lng, lng: lyon.lat };
    expect(distanceKm(paris, swapped)).not.toBeCloseTo(distanceKm(paris, lyon)!, 0);
  });
});
