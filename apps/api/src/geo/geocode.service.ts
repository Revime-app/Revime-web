import { Injectable, Logger } from '@nestjs/common';
import type { Coords } from './haversine.js';

const BAN_ENDPOINT = 'https://api-adresse.data.gouv.fr/search/';
const TIMEOUT_MS = 4000;

type BanResponse = {
  features?: {
    geometry?: { coordinates?: [number, number] };
    properties?: { city?: string };
  }[];
};

/**
 * What BAN gives us for a postal code: a municipality centroid plus its name.
 *
 * `city` is the commune as BAN names it, which for an arrondissement postal
 * code is the arrondissement and not the city - 69003 is "Lyon 3e
 * Arrondissement". It is a display string only, and null whenever BAN omits it.
 */
export type GeocodeResult = Coords & { city: string | null };

/**
 * Postal code to coordinates via the French government BAN service.
 *
 * Free, keyless and run by a French public body, so there is no contractual
 * data transfer to reason about - which keeps the GDPR position established in
 * 3a (Paris database, Frankfurt API) intact.
 *
 * NEVER THROWS. An unreachable BAN, a timeout or an unknown code all yield
 * null, because publishing a demande must not depend on a third party being up.
 * Distance is a comparison nicety; publishing is the product.
 *
 * 🆕 MEMOISED, 2026-09-02, and **successful lookups only** - see `cache` below, which carries the
 * reason a null must never be stored. This is a singleton in Nest's default scope, so the cache
 * lives for the process. It exists because `RepairersService.list` geocodes on every request
 * carrying `near`, which turned each debounced directory keystroke into a fresh BAN call with a
 * 4-second timeout in the read path.
 */
@Injectable()
export class GeocodeService {
  private readonly logger = new Logger(GeocodeService.name);

  /**
   * SUCCESSFUL lookups only, keyed by the postal code exactly as the caller gave it.
   *
   * 🛑 **A NULL IS NEVER STORED HERE, and that asymmetry is the whole safety argument.**
   * `lookupPostalCode` answers null for an unknown code AND for an unreachable or slow BAN, and
   * this class cannot tell those apart - see its header. Cache one and a SINGLE transient outage
   * keeps the distance feature broken for the life of the process, long after BAN recovers, with
   * nothing logged and nothing to retry. `demandes.service.ts`'s update path records the same
   * hazard pointing the other way (« re-running it against an UNCHANGED code would let one
   * transient BAN outage overwrite good coordinates with null »). So: a hit is permanent, a miss
   * is always retried.
   *
   * **No TTL, deliberately.** A commune centroid does not move. What the entry describes is
   * `type=municipality&limit=1` for a five-digit code, which is stable on a timescale of years -
   * far longer than any API process lives here.
   *
   * **Unbounded, and bounded in practice.** Every caller validates first: `directoryQuerySchema`'s
   * `near` and `postalCodeSchema` both enforce `/^\d{5}$/`, so the key domain is at most 100,000
   * strings of five characters, and France has ~34,000 real codes. One entry is a 5-char key plus
   * three primitives. There is nothing here worth an eviction policy.
   *
   * **In-flight requests are NOT deduplicated**, also deliberately: this caches a resolved VALUE,
   * not a promise. Two truly simultaneous first lookups of the same code therefore cost two BAN
   * calls and then both are served from cache. Caching the promise would dedupe them and would
   * also cache a REJECTED/null-resolving one, which is the case above; the extra call is the
   * cheaper mistake.
   */
  private readonly cache = new Map<string, GeocodeResult>();

  async lookupPostalCode(postalCode: string): Promise<GeocodeResult | null> {
    const cached = this.cache.get(postalCode);
    if (cached !== undefined) return cached;

    const result = await this.fetchPostalCode(postalCode);
    // `if (result)` rather than `!== null`: only a real hit is stored. Every failure path in
    // `fetchPostalCode` returns null and must stay retryable.
    if (result !== null) this.cache.set(postalCode, result);
    return result;
  }

  /**
   * The network half, unchanged. Split out only so `lookupPostalCode` can be read as « cache, or
   * ask BAN » in four lines - every `return null` below is a path the cache must NOT record.
   */
  private async fetchPostalCode(postalCode: string): Promise<GeocodeResult | null> {
    const url = `${BAN_ENDPOINT}?q=${encodeURIComponent(postalCode)}&postcode=${encodeURIComponent(
      postalCode,
    )}&type=municipality&limit=1`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) {
        this.logger.warn(`BAN returned ${res.status} for ${postalCode}`);
        return null;
      }

      const body = (await res.json()) as BanResponse;
      const feature = body.features?.[0];
      const coordinates = feature?.geometry?.coordinates;
      if (!feature || !coordinates) return null;

      // GeoJSON order is [longitude, latitude].
      const [lng, lat] = coordinates;
      if (typeof lat !== 'number' || typeof lng !== 'number') return null;

      const city = feature.properties?.city;

      return { lat, lng, city: typeof city === 'string' && city.length > 0 ? city : null };
    } catch (error) {
      this.logger.warn(`BAN lookup failed for ${postalCode}: ${String(error)}`);
      return null;
    }
  }
}
