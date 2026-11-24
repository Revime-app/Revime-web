/**
 * The French company registry, behind one interface so the source can be swapped.
 *
 * V1 reads `recherche-entreprises.api.gouv.fr`, which needs no key and no account
 * and republishes Sirene plus RNE. INSEE's own Sirene 3.11 answers 401 without a
 * portal key and carries no officer data, so it is a documented swap target rather
 * than the V1 source - see the design's §2.2 and §4.3 for what would force it.
 */

const BASE = 'https://recherche-entreprises.api.gouv.fr/search';

/**
 * A choice, NOT a measurement. Every probe on 2026-08-19 answered in well under a
 * second and no slow case has been observed, so this number is sized on nothing but
 * the fact that a free service with no SLA must not be able to hang a user's
 * request. Expiry is a 503 and a FAILED ledger row, never a silent pass.
 */
const TIMEOUT_MS = 5000;

/** Officers as the registry gives them, minus their dates of birth. Evidence only. */
export type RegistryOfficer = {
  nom: string;
  prenoms: string | null;
  qualite: string | null;
};

export type RegistryCompany = {
  siren: string;
  /** Echoes back only the SIRET that was asked for, never the siège's by default. */
  siret: string | null;
  denomination: string | null;
  legalFormCode: string | null;
  establishmentAddress: string | null;
  /** The registry's own vocabulary, unmapped: 'A' active, 'C' ceased. */
  etatAdministratif: string;
  diffusible: boolean;
  dirigeants: RegistryOfficer[];
};

export interface RegistryGateway {
  /** null means "nothing verified": unknown siren, or an établissement it does not have. */
  lookup(input: { siren: string; siret: string | null }): Promise<RegistryCompany | null>;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * Turns one search response into a company, or null.
 *
 * Exported for unit test, and tested against a payload captured from the live API
 * rather than one written from memory.
 */
export function mapSearchResult(
  body: unknown,
  want: { siren: string; siret: string | null },
): RegistryCompany | null {
  const results = (body as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) {
    // Throwing rather than returning null, for the reason summariseSession throws on
    // an unrecognised Stripe status: null reads as "no such company" and would refuse
    // a real one, which is a worse lie than an outage.
    throw new Error('Unrecognised registry response shape: no results array');
  }

  const row = results.find(
    (r): r is Record<string, unknown> =>
      typeof r === 'object' && r !== null && (r as { siren?: unknown }).siren === want.siren,
  );

  // THE assertion this whole approach rests on. `q=` is a fuzzy full-text search: on
  // 2026-08-19 the bogus 123456789 answered with a row. A non-empty result set is not
  // evidence that the number asked for exists.
  if (!row) return null;

  const siege = (row.siege ?? null) as Record<string, unknown> | null;
  const matching = Array.isArray(row.matching_etablissements)
    ? (row.matching_etablissements as Record<string, unknown>[])
    : [];

  let establishment: Record<string, unknown> | null = siege;
  if (want.siret) {
    const found =
      [...matching, ...(siege ? [siege] : [])].find((e) => e.siret === want.siret) ?? null;
    // He named an établissement this company does not have. Same answer as an unknown
    // SIREN, because the same amount was verified: nothing.
    if (!found) return null;
    establishment = found;
  }

  const etat = str(row.etat_administratif);
  if (!etat) {
    // NOT a company, and NOT an outage: this is the stub row the endpoint echoes for a
    // nine-digit string that is not an allocated SIREN. Measured on 2026-08-19 with the
    // Luhn-valid unallocated `999999998`: `total_results: 1`, `siren` echoing the query
    // exactly - so the equality assertion above passes - `nom_complet` even carrying a
    // name, `siege` an empty object, no établissements, and `etat_administratif` NULL.
    //
    // This returns null so the service answers « Aucune entreprise ne correspond à ce
    // numéro. » It THREW until the final review asked for this probe, which made the
    // service report « le registre est momentanément indisponible » - false, since the
    // registry answered perfectly well, and advice to retry something that will never
    // succeed. No badge could be granted either way (both paths refuse), so the defect
    // was the message rather than the outcome.
    return null;
  }

  return {
    siren: want.siren,
    siret: want.siret,
    // nom_raison_sociale first, nom_complet second: measured on 2026-08-19, an
    // entreprise individuelle has the former null and only the latter carries a name.
    denomination: str(row.nom_raison_sociale) ?? str(row.nom_complet),
    legalFormCode: str(row.nature_juridique),
    establishmentAddress: establishment ? str(establishment.adresse) : null,
    etatAdministratif: etat,
    // 'O' is the only value measured, so anything else is treated as hidden. That half
    // is inference, which is why a null denomination is a supported outcome rather
    // than unreachable defensive code.
    diffusible: str(row.statut_diffusion) === 'O',
    dirigeants: (Array.isArray(row.dirigeants) ? row.dirigeants : [])
      .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null)
      .map((d) => ({
        nom: str(d.nom) ?? '',
        prenoms: str(d.prenoms),
        qualite: str(d.qualite),
      })),
  };
}

class AnnuaireRegistryGateway implements RegistryGateway {
  async lookup(input: { siren: string; siret: string | null }): Promise<RegistryCompany | null> {
    // Query on the SIRET when there is one, which narrows `matching_etablissements` to
    // the établissement asked about - measured on 2026-08-19 rather than assumed: La
    // Poste's SIREN `356000000` returns 0 matching établissements while its SIRET
    // `35600000000048` returns exactly that one.
    const q = input.siret ?? input.siren;
    // `per_page=10`, not 1. `q=` is a fuzzy full-text search, so the row for the SIREN
    // asked about need not be first - and `mapSearchResult`'s equality assertion scans
    // the array to find it. Asking for one result reduces that scan to "check the first
    // element" and quietly removes the defence the whole design rests on. Every
    // identifier query measured so far answers `total_results: 1` with the exact match
    // first, so this costs nothing today and stops the ranker mattering tomorrow.
    const res = await fetch(`${BASE}?q=${encodeURIComponent(q)}&per_page=10`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Registry answered ${res.status}`);
    }
    return mapSearchResult(await res.json(), input);
  }
}

/**
 * In-memory registry for the test suite. Reaches no network and fabricates nothing
 * on its own - a test must register every company it expects to find.
 */
export class FakeRegistryGateway implements RegistryGateway {
  private readonly bySiren = new Map<string, RegistryCompany>();
  private failNext = false;

  /** Test-only. */
  register(company: RegistryCompany): void {
    this.bySiren.set(company.siren, company);
  }

  /** Test-only. Makes the next lookup throw, to exercise the 503 path. */
  failNextLookupOnce(): void {
    this.failNext = true;
  }

  /** Test-only. */
  reset(): void {
    this.bySiren.clear();
    this.failNext = false;
  }

  lookup(input: { siren: string; siret: string | null }): Promise<RegistryCompany | null> {
    if (this.failNext) {
      // Reset AS IT FIRES, not after the test: the factory memoises one instance for
      // the whole process, so a flag left standing poisons every later test.
      this.failNext = false;
      return Promise.reject(new Error('Fake registry failure for test'));
    }
    const found = this.bySiren.get(input.siren) ?? null;
    if (!found) return Promise.resolve(null);
    // Mirrors the real driver: naming an établissement the company does not have
    // verifies nothing.
    if (input.siret && input.siret !== found.siret) return Promise.resolve(null);
    return Promise.resolve({ ...found, siret: input.siret });
  }
}

let instance: RegistryGateway | undefined;

/**
 * **This factory inverts the codebase's driver default, deliberately.**
 *
 * `STRIPE_DRIVER` absent gives the fake; `SMS_DRIVER` absent gives the console. Here
 * the fake is the dangerous one: a fake registry grants a REAL badge on a company
 * nobody verified, which is the fabricated-data failure this project has a
 * client-accepted rule against. So the real registry is the default and the fake is
 * opt-in and loud. It needs no credential, so there is nothing for an absent
 * variable to fail safe about.
 */
export function registryGateway(): RegistryGateway {
  instance ??=
    process.env.REGISTRY_DRIVER === 'fake'
      ? new FakeRegistryGateway()
      : new AnnuaireRegistryGateway();
  return instance;
}

/** Test-only. The factory memoises, so a test changing REGISTRY_DRIVER must clear it. */
export function __resetRegistryGateway(): void {
  instance = undefined;
}
