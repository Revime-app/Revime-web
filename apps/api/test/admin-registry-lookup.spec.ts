import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminRepairersService } from '../src/admin/admin-repairers.service.js';
import {
  FakeRegistryGateway,
  registryGateway,
  __resetRegistryGateway,
  type RegistryCompany,
} from '../src/business/gateway.js';

afterEach(() => __resetRegistryGateway());

const prismaSpy = () => ({
  businessVerification: { upsert: vi.fn(), findUnique: vi.fn() },
  verificationAttempt: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
  profile: { updateMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
  identityVerification: { findMany: vi.fn().mockResolvedValue([]) },
});

const company = (over: Partial<RegistryCompany> = {}): RegistryCompany => ({
  siren: '123456789',
  siret: null,
  denomination: 'ATELIER FIXTURE',
  legalFormCode: '1000',
  establishmentAddress: '12 RUE DE LA FIXTURE 16000 ANGOULEME',
  etatAdministratif: 'A',
  diffusible: true,
  dirigeants: [{ nom: 'FIXTURE', prenoms: 'CAMILLE', qualite: 'Gérant' }],
  ...over,
});

describe('the operator registry lookup', () => {
  it('returns what the registry said', async () => {
    // Install a fake gateway and seed one company.
    process.env.REGISTRY_DRIVER = 'fake';
    const fake = registryGateway() as FakeRegistryGateway;
    fake.register(company());

    const prisma = prismaSpy();
    const service = new AdminRepairersService(prisma as never);
    const out = await service.registryLookup('123456789');

    expect(out.found).toBe(true);
    if (!out.found) return; // TypeScript narrowing
    expect(out.siren).toBe('123456789');
    expect(out.denomination).toBe('ATELIER FIXTURE');
    expect(out.officers).toHaveLength(1);
    expect(out.officers[0]?.nom).toBe('FIXTURE');
    expect(out.officers[0]?.prenoms).toBe('CAMILLE');
    expect(out.officers[0]?.qualite).toBe('Gérant');
  });

  it('returns { found: false } for an unknown SIREN rather than throwing', async () => {
    process.env.REGISTRY_DRIVER = 'fake';
    registryGateway(); // Initialize the fake
    const prisma = prismaSpy();
    const service = new AdminRepairersService(prisma as never);
    expect(await service.registryLookup('999999998')).toEqual({ found: false });
  });

  /**
   * 🛑 THE ASSERTION THIS ROUTE EXISTS TO KEEP TRUE. Decision 5 is « writes nothing »: no
   * BusinessVerification row, no promotion, and no VerificationAttempt.
   *
   * The last of those is not fastidiousness. checkRegistryLimit counts VerificationAttempt
   * rows keyed on `target`, which is the SIREN - so writing one here would consume
   * MAX_REGISTRY_LOOKUPS_PER_SIREN_PER_DAY = 20 and LOCK OUT the réparateur who owns that
   * company. rate-limit.ts:147-149 states the principle: a refusal must not consume the
   * budget of the account, or of the company, it was aimed at.
   */
  it('writes nothing at all', async () => {
    process.env.REGISTRY_DRIVER = 'fake';
    const fake = registryGateway() as FakeRegistryGateway;
    fake.register(company());

    const prisma = prismaSpy();
    const service = new AdminRepairersService(prisma as never);
    await service.registryLookup('123456789');

    expect(prisma.businessVerification.upsert).not.toHaveBeenCalled();
    expect(prisma.verificationAttempt.create).not.toHaveBeenCalled();
    expect(prisma.profile.updateMany).not.toHaveBeenCalled();
  });

  it('surfaces an unreachable registry as its own message, never as "not found"', async () => {
    process.env.REGISTRY_DRIVER = 'fake';
    const fake = registryGateway() as FakeRegistryGateway;
    fake.failNextLookupOnce();

    const prisma = prismaSpy();
    const service = new AdminRepairersService(prisma as never);

    // Install a gateway whose lookup rejects; assert the thrown message mentions the
    // registry being unavailable rather than returning { found: false }, which would tell
    // the operator the company does not exist.
    await expect(service.registryLookup('123456789')).rejects.toThrow(/registre/i);
  });
});
