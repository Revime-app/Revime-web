import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FakeStorageGateway,
  __resetStorageGateway,
  isStorageConfigured,
  storageGateway,
} from '../src/storage/gateway.js';

const saved = { ...process.env };

beforeEach(() => {
  __resetStorageGateway();
  delete process.env.STORAGE_DRIVER;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});
afterEach(() => {
  process.env = { ...saved };
  __resetStorageGateway();
});

describe('storage gateway factory', () => {
  // Deleting the variables rather than trusting the ambient value is what lets this test
  // see the absent case at all -- the same reason the REGISTRY_DRIVER test deletes it.
  it('selects the FAKE when nothing is configured', () => {
    expect(storageGateway()).toBeInstanceOf(FakeStorageGateway);
    expect(isStorageConfigured()).toBe(false);
  });

  it('selects the FAKE when the driver is named but credentials are missing', () => {
    process.env.STORAGE_DRIVER = 'supabase';
    expect(storageGateway()).toBeInstanceOf(FakeStorageGateway);
    expect(isStorageConfigured()).toBe(false);
  });

  it('selects the FAKE when credentials exist but the driver is not named', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    expect(storageGateway()).toBeInstanceOf(FakeStorageGateway);
    expect(isStorageConfigured()).toBe(false);
  });

  it('reports configured only when the driver AND both credentials are present', () => {
    process.env.STORAGE_DRIVER = 'supabase';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    expect(isStorageConfigured()).toBe(true);
    expect(storageGateway()).not.toBeInstanceOf(FakeStorageGateway);
  });
});

describe('fake gateway', () => {
  it('round-trips an upload, a read url, a list and a removal', async () => {
    const g = new FakeStorageGateway();
    const up = await g.createSignedUpload('demandes/u/d/o.jpg', 'image/jpeg');
    expect(up.path).toBe('demandes/u/d/o.jpg');
    expect(up.uploadUrl).toContain('demandes/u/d/o.jpg');

    // Simulate the client PUTting the bytes. Signing alone does not create an object.
    g.seed('demandes/u/d/o.jpg');

    const urls = await g.createSignedReadUrls(['demandes/u/d/o.jpg'], 3600);
    expect(urls.get('demandes/u/d/o.jpg')).toBeTruthy();

    expect((await g.listPrefix('demandes/u/d')).map((o) => o.name)).toEqual(['o.jpg']);

    await g.remove(['demandes/u/d/o.jpg']);
    expect(await g.listPrefix('demandes/u/d')).toEqual([]);
  });

  it('returns no url for a path it never stored, rather than a fabricated one', async () => {
    const g = new FakeStorageGateway();
    const urls = await g.createSignedReadUrls(['demandes/u/d/missing.jpg'], 60);
    expect(urls.has('demandes/u/d/missing.jpg')).toBe(false);
  });
});
