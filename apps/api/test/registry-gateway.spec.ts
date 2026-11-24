import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FakeRegistryGateway,
  mapSearchResult,
  registryGateway,
  __resetRegistryGateway,
} from '../src/business/gateway.js';

/** The real response shape, captured on 2026-08-19 with personal fields replaced. */
const body: unknown = JSON.parse(
  readFileSync(new URL('./fixtures/registry-search.json', import.meta.url), 'utf8'),
);

const want = { siren: '980491005', siret: null };

describe('mapSearchResult', () => {
  it('maps a real payload into the fields the service judges on', () => {
    const company = mapSearchResult(body, want);
    expect(company).not.toBeNull();
    expect(company?.siren).toBe('980491005');
    expect(company?.etatAdministratif).toBe('A');
    expect(company?.diffusible).toBe(true);
    expect(company?.legalFormCode).toBe('1000');
    expect(company?.establishmentAddress).toBe('12 RUE DE LA FIXTURE 16000 ANGOULEME');
  });

  it('falls back to nom_complet, because an entreprise individuelle has no raison sociale', () => {
    // Measured on 2026-08-19: nom_raison_sociale is null on a personne physique and
    // only nom_complet carries the name.
    expect(mapSearchResult(body, want)?.denomination).toBe('ATELIER FIXTURE (FIXTURE)');
  });

  it('keeps officers without their dates of birth', () => {
    const officers = mapSearchResult(body, want)?.dirigeants;
    expect(officers).toEqual([{ nom: 'FIXTURE', prenoms: 'CAMILLE', qualite: null }]);
    // The registry returns date_de_naissance. We never read the officer list, so
    // storing a third party's birth date would be PII this application never uses.
    expect(JSON.stringify(officers)).not.toContain('1989');
  });

  it('returns null when the row is for a DIFFERENT siren than the one asked for', () => {
    // THE assertion the whole approach rests on. `q=` is a fuzzy full-text search:
    // on 2026-08-19 the bogus 123456789 answered with a row.
    expect(mapSearchResult(body, { siren: '123456789', siret: null })).toBeNull();
  });

  it('returns null when the siret asked for belongs to no établissement of that company', () => {
    expect(mapSearchResult(body, { siren: '980491005', siret: '98049100599999' })).toBeNull();
  });

  it('accepts the siret when an établissement carries it, and reports its address', () => {
    const company = mapSearchResult(body, { siren: '980491005', siret: '98049100500016' });
    expect(company?.siret).toBe('98049100500016');
    expect(company?.establishmentAddress).toBe('12 RUE DE LA FIXTURE 16000 ANGOULEME');
  });

  it('returns a CEASED company rather than null, so the service can say why', () => {
    const ceased = structuredClone(body) as { results: { etat_administratif: string }[] };
    ceased.results[0]!.etat_administratif = 'C';
    expect(mapSearchResult(ceased, want)?.etatAdministratif).toBe('C');
  });

  it('reads a hidden identity as not diffusible', () => {
    const hidden = structuredClone(body) as {
      results: {
        statut_diffusion: string;
        nom_complet: string | null;
        nom_raison_sociale: string | null;
      }[];
    };
    hidden.results[0]!.statut_diffusion = 'P';
    hidden.results[0]!.nom_complet = null;
    hidden.results[0]!.nom_raison_sociale = null;
    const company = mapSearchResult(hidden, want);
    expect(company?.diffusible).toBe(false);
    expect(company?.denomination).toBeNull();
  });

  it('returns an empty officer list rather than throwing when RNE holds none', () => {
    // Measured on a real SARL (401304589): dirigeants is [].
    const none = structuredClone(body) as { results: { dirigeants: unknown[] }[] };
    none.results[0]!.dirigeants = [];
    expect(mapSearchResult(none, want)?.dirigeants).toEqual([]);
  });

  it('treats the stub row for an UNALLOCATED siren as not-found, not as an outage', () => {
    // The exact shape measured on 2026-08-19 for the Luhn-valid unallocated 999999998:
    // the endpoint answers total_results 1 with `siren` echoing the query, a name, an
    // EMPTY siege, no établissements, and a null etat_administratif. So the
    // siren-equality assertion passes and this row is the last line of defence.
    //
    // It must map to null - « Aucune entreprise ne correspond à ce numéro. » - and not
    // throw, because a throw makes the service claim the registry is unavailable when
    // the registry answered perfectly and the company simply does not exist.
    const stub = {
      results: [
        {
          siren: '999999998',
          nom_complet: 'JACQUES JUND',
          nom_raison_sociale: null,
          nature_juridique: null,
          etat_administratif: null,
          statut_diffusion: null,
          dirigeants: [],
          siege: {},
          matching_etablissements: [],
        },
      ],
      total_results: 1,
    };
    expect(mapSearchResult(stub, { siren: '999999998', siret: null })).toBeNull();
  });

  it('THROWS on an ENVELOPE it cannot read, rather than defaulting', () => {
    // The choice summariseSession makes for an unrecognised Stripe status: defaulting
    // etat_administratif to 'A' would grant a badge on a payload nobody parsed.
    //
    // Scoped to the envelope - no `results` array at all. A row present but missing its
    // etat_administratif used to throw here too, and that was wrong: it is the real
    // response for an unallocated SIREN, measured on 2026-08-19, so it belongs to the
    // not-found test above. Throwing on it made the service claim an outage.
    expect(() => mapSearchResult({ unexpected: true }, want)).toThrow();
    expect(() => mapSearchResult({ results: 'not an array' }, want)).toThrow();
    expect(() => mapSearchResult(null, want)).toThrow();
  });
});

describe('registryGateway factory', () => {
  afterEach(() => {
    __resetRegistryGateway();
    delete process.env.REGISTRY_DRIVER;
  });

  it('selects the FAKE only when asked explicitly', () => {
    process.env.REGISTRY_DRIVER = 'fake';
    __resetRegistryGateway();
    expect(registryGateway()).toBeInstanceOf(FakeRegistryGateway);
  });

  it('selects the REAL registry when the variable is absent, inverting the local default', () => {
    // Everywhere else absence means off: STRIPE_DRIVER absent gives the fake,
    // SMS_DRIVER absent gives the console. Here the FAKE is the dangerous one - it
    // would grant a real badge on a company nobody verified - so absence must mean
    // the real registry. An inversion nobody tests is one refactor from flipping.
    delete process.env.REGISTRY_DRIVER;
    __resetRegistryGateway();
    expect(registryGateway()).not.toBeInstanceOf(FakeRegistryGateway);
  });
});

describe('FakeRegistryGateway', () => {
  it('mirrors the real driver on an établissement the company does not have', async () => {
    const fake = new FakeRegistryGateway();
    fake.register({
      siren: '980491005',
      siret: '98049100500016',
      denomination: 'ATELIER FIXTURE',
      legalFormCode: '1000',
      establishmentAddress: '12 RUE DE LA FIXTURE 16000 ANGOULEME',
      etatAdministratif: 'A',
      diffusible: true,
      dirigeants: [],
    });
    expect(await fake.lookup({ siren: '980491005', siret: '98049100599999' })).toBeNull();
    expect(await fake.lookup({ siren: '980491005', siret: null })).not.toBeNull();
    expect(await fake.lookup({ siren: '111111111', siret: null })).toBeNull();
  });

  it('throws once when asked to, to exercise the unavailable path', async () => {
    const fake = new FakeRegistryGateway();
    fake.failNextLookupOnce();
    await expect(fake.lookup({ siren: '980491005', siret: null })).rejects.toThrow();
    // Resets as it fires: the factory memoises one instance per process, so a flag
    // left standing would poison every later test in the file.
    expect(await fake.lookup({ siren: '980491005', siret: null })).toBeNull();
  });
});
