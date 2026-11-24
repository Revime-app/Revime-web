import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeocodeService } from '../src/geo/geocode.service.js';

function mockFetch(impl: () => Promise<unknown>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(impl as never);
}

const banHit = {
  features: [
    {
      geometry: { type: 'Point', coordinates: [4.8357, 45.764] },
      properties: { city: 'Lyon 3e Arrondissement' },
    },
  ],
};

describe('GeocodeService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps a BAN hit to coordinates, reading lng before lat', async () => {
    // BAN returns GeoJSON, so coordinates are [longitude, latitude]. Reading
    // them in array order would silently swap them.
    mockFetch(async () => ({ ok: true, json: async () => banHit }));

    const coords = await new GeocodeService().lookupPostalCode('69003');

    expect(coords).toEqual({ lat: 45.764, lng: 4.8357, city: 'Lyon 3e Arrondissement' });
  });

  it('returns null when BAN has no match', async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({ features: [] }) }));
    expect(await new GeocodeService().lookupPostalCode('99999')).toBeNull();
  });

  it('returns null when BAN is unreachable, and does not throw', async () => {
    mockFetch(async () => {
      throw new Error('ENOTFOUND');
    });
    await expect(new GeocodeService().lookupPostalCode('69003')).resolves.toBeNull();
  });

  it('returns null on a non-2xx from BAN', async () => {
    mockFetch(async () => ({ ok: false, json: async () => ({}) }));
    expect(await new GeocodeService().lookupPostalCode('69003')).toBeNull();
  });

  it('asks BAN for a municipality, limited to one result', async () => {
    const spy = mockFetch(async () => ({ ok: true, json: async () => banHit }));
    await new GeocodeService().lookupPostalCode('69003');

    const url = String(spy.mock.calls[0]?.[0]);
    expect(url).toContain('api-adresse.data.gouv.fr');
    expect(url).toContain('postcode=69003');
    expect(url).toContain('limit=1');
  });

  it('returns the municipality name, including the long arrondissement form', async () => {
    // Verified against the live service on 2026-08-14: 69003 yields
    // "Lyon 3e Arrondissement", not "Lyon". The UI must not assume it is short.
    mockFetch(async () => ({ ok: true, json: async () => banHit }));

    const result = await new GeocodeService().lookupPostalCode('69003');

    expect(result?.city).toBe('Lyon 3e Arrondissement');
  });

  it('still returns coordinates when BAN sends no city, with city null', async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => ({
        features: [{ geometry: { type: 'Point', coordinates: [4.8357, 45.764] } }],
      }),
    }));

    const result = await new GeocodeService().lookupPostalCode('69003');

    expect(result).toEqual({ lat: 45.764, lng: 4.8357, city: null });
  });
});

/**
 * `CF-34`'s whole-branch review, 2026-09-02. THE MEMOISATION, and this block is the reason the
 * memoisation is safe rather than merely faster.
 *
 * Why it exists: `RepairersService.list` geocodes on EVERY request carrying `near`, so once a
 * client applies a postal code, every debounced search keystroke, every pull-to-refresh and every
 * remount was a fresh BAN lookup - with a 4-second timeout sitting in the request path of a
 * directory read. Design §6.1 already ruled that out for the sheet (« BAN is free and keyless,
 * which is not a licence to call it once per typed character »); the server half had no such guard.
 *
 * 🛑 THE ASYMMETRY IS THE POINT: A SUCCESS IS CACHED AND A NULL IS NOT. `lookupPostalCode` answers
 * null for an unknown code AND for an unreachable or slow BAN, and those are not distinguishable
 * from inside - so caching a null would let ONE transient outage keep the feature broken after BAN
 * recovers. `demandes.service.ts` already records this hazard in the opposite direction (« one
 * transient BAN outage overwrite good coordinates with null »). A commune centroid, by contrast,
 * does not move, so a hit can live for the life of the process.
 *
 * Every test above deliberately constructs its OWN `GeocodeService`, so the cache is per-instance
 * and none of them can leak into another.
 */
describe('GeocodeService memoises SUCCESSFUL lookups only', () => {
  afterEach(() => vi.restoreAllMocks());

  it('hits the network ONCE for a repeated lookup of the same code', async () => {
    const spy = mockFetch(async () => ({ ok: true, json: async () => banHit }));
    const service = new GeocodeService();

    const first = await service.lookupPostalCode('69003');
    const second = await service.lookupPostalCode('69003');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(second).toEqual({ lat: 45.764, lng: 4.8357, city: 'Lyon 3e Arrondissement' });
  });

  it('hits the network again for a DIFFERENT code', async () => {
    // The cache is keyed on the postal code, not a single last-value slot.
    const spy = mockFetch(async () => ({ ok: true, json: async () => banHit }));
    const service = new GeocodeService();

    await service.lookupPostalCode('69003');
    await service.lookupPostalCode('75001');

    expect(spy).toHaveBeenCalledTimes(2);
    expect(String(spy.mock.calls[1]?.[0])).toContain('postcode=75001');
  });

  it('does NOT cache a null from an unreachable BAN, so the next call retries', async () => {
    let calls = 0;
    const spy = mockFetch(async () => {
      calls += 1;
      if (calls === 1) throw new Error('ENOTFOUND');
      return { ok: true, json: async () => banHit };
    });
    const service = new GeocodeService();

    expect(await service.lookupPostalCode('69003')).toBeNull();
    // The outage is over. Had the null been cached, this would still be null and the directory's
    // distance filter would stay broken for the life of the process.
    expect(await service.lookupPostalCode('69003')).toEqual({
      lat: 45.764,
      lng: 4.8357,
      city: 'Lyon 3e Arrondissement',
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('does NOT cache a null from an empty BAN result either', async () => {
    // Same null, different cause - and the two are indistinguishable from here, which is exactly
    // why neither may be cached.
    let calls = 0;
    const spy = mockFetch(async () => {
      calls += 1;
      return calls === 1
        ? { ok: true, json: async () => ({ features: [] }) }
        : { ok: true, json: async () => banHit };
    });
    const service = new GeocodeService();

    expect(await service.lookupPostalCode('69003')).toBeNull();
    expect(await service.lookupPostalCode('69003')).not.toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('does NOT cache a null from a non-2xx either', async () => {
    let calls = 0;
    const spy = mockFetch(async () => {
      calls += 1;
      return calls === 1
        ? { ok: false, json: async () => ({}) }
        : { ok: true, json: async () => banHit };
    });
    const service = new GeocodeService();

    expect(await service.lookupPostalCode('69003')).toBeNull();
    expect(await service.lookupPostalCode('69003')).not.toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
