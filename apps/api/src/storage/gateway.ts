import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { PHOTO_BUCKET } from './photo-paths.js';

export type SignedUpload = { path: string; uploadUrl: string };
export type StoredObject = { name: string; createdAt: string };

export interface StorageGateway {
  createSignedUpload(path: string, contentType: string, bucket?: string): Promise<SignedUpload>;
  /** Path to signed URL. A path with no object is ABSENT from the map, never fabricated. */
  createSignedReadUrls(paths: string[], ttlSeconds: number, bucket?: string): Promise<Map<string, string>>;
  /** Returns objects with names RELATIVE TO THE PREFIX (e.g. "o.jpg", not "demandes/u/d/o.jpg"). */
  listPrefix(prefix: string): Promise<StoredObject[]>;
  remove(paths: string[]): Promise<void>;
  /**
   * Livraison Boxtal. Server-side write of bytes fetched from a third party (a label PDF).
   * Takes the bucket explicitly because the label bucket is NOT the photo bucket: that one is
   * MIME-restricted to JPEG/PNG at the Supabase level (photos spec §3).
   */
  putObject(bucket: string, path: string, bytes: Buffer, contentType: string): Promise<void>;
  /**
   * V7 D5 (U9b). Server-side read of one object, null when it does not exist. Used to hash a legal
   * PDF the dashboard uploaded through a signed URL before its version is published.
   */
  getObject(bucket: string, path: string): Promise<Buffer | null>;
}

/**
 * True only when the driver is named AND both credentials are present. The signing route
 * reads this to fail closed with a configuration error rather than quietly handing out
 * fake URLs that no upload can use.
 */
export function isStorageConfigured(): boolean {
  // 🛑 `fake` counts as CONFIGURED while still selecting the fake gateway below, and without
  // this the signing route is untestable: requiring `supabase` to be "configured" makes the
  // factory choose the real gateway, so an integration test with a placeholder host produces
  // `getaddrinfo ENOTFOUND` and a 500 rather than exercising the route. Measured, not
  // theorised - it cost five failing tests on the first run of Task 4.
  //
  // Same shape as `REGISTRY_DRIVER=fake`, which this project already sets in `apps/api/.env`
  // for the test suite only. It must be typed out explicitly to take effect, and if it ever
  // reached production the failure is visible rather than dangerous: uploads would go to a URL
  // that stores nothing, instead of anything being granted or charged.
  if (process.env.STORAGE_DRIVER === 'fake') return true;

  return (
    process.env.STORAGE_DRIVER === 'supabase' &&
    Boolean(process.env.SUPABASE_URL) &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

/**
 * Supabase Storage over its REST API with `fetch`. NO new dependency: adding
 * `@supabase/supabase-js` for three endpoints would pull a Postgres client, a realtime
 * client and an auth client the API already has its own versions of.
 */
export class SupabaseStorageGateway implements StorageGateway {
  private readonly base = `${(process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')}/storage/v1`;
  private readonly key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.key}`,
      apikey: this.key,
      'content-type': 'application/json',
    };
  }

  /**
   * Absolutises a URL returned by Supabase. The shape is unverified - no live credentials
   * exist yet to confirm what Supabase actually returns. This helper handles all three forms:
   * already-absolute (http(s)://), full path including /storage/v1, or relative to /storage/v1.
   */
  private absolutiseUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const host = this.base.replace(/\/storage\/v1$/, '');
    if (url.startsWith('/storage/v1')) return `${host}${url}`;
    return `${this.base}${url}`;
  }

  private async call(path: string, init: RequestInit): Promise<unknown> {
    const res = await fetch(`${this.base}${path}`, { ...init, headers: this.headers() });
    if (!res.ok) {
      // The body carries Supabase's own reason; losing it turns every storage failure into
      // one indistinguishable 500.
      throw new Error(`storage ${init.method ?? 'GET'} ${path} -> ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  async createSignedUpload(path: string, _contentType: string, bucket: string = PHOTO_BUCKET): Promise<SignedUpload> {
    const body = (await this.call(`/object/upload/sign/${bucket}/${path}`, {
      method: 'POST',
      body: JSON.stringify({}),
    })) as { url: string };
    return { path, uploadUrl: this.absolutiseUrl(body.url) };
  }

  async createSignedReadUrls(paths: string[], ttlSeconds: number, bucket: string = PHOTO_BUCKET): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (paths.length === 0) return out;
    // ONE call for N paths. Signing per photo would make a ten-photo demande ten round trips.
    const rows = (await this.call(`/object/sign/${bucket}`, {
      method: 'POST',
      body: JSON.stringify({ expiresIn: ttlSeconds, paths }),
    })) as { path: string | null; signedURL: string | null; error: string | null }[];
    for (const r of rows) {
      if (r.path && r.signedURL && !r.error) out.set(r.path, this.absolutiseUrl(r.signedURL));
    }
    return out;
  }

  /** The shape `scripts/seed-demo/photos.mjs` already uses against production: POST bytes, upsert. */
  async putObject(bucket: string, path: string, bytes: Buffer, contentType: string): Promise<void> {
    const res = await fetch(`${this.base}/object/${bucket}/${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.key}`, apikey: this.key, 'content-type': contentType, 'x-upsert': 'true' },
      body: new Uint8Array(bytes),
    });
    if (!res.ok) throw new Error(`storage POST /object/${bucket}/${path} -> ${res.status} ${await res.text()}`);
  }

  async getObject(bucket: string, path: string): Promise<Buffer | null> {
    const res = await fetch(`${this.base}/object/${bucket}/${path}`, {
      headers: { authorization: `Bearer ${this.key}`, apikey: this.key },
    });
    // Storage answers a missing object with 400 (« Object not found »), sometimes 404.
    if (res.status === 400 || res.status === 404) return null;
    if (!res.ok) throw new Error(`storage GET /object/${bucket}/${path} -> ${res.status} ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async listPrefix(prefix: string): Promise<StoredObject[]> {
    const rows = (await this.call(`/object/list/${PHOTO_BUCKET}`, {
      method: 'POST',
      body: JSON.stringify({ prefix, limit: 100, offset: 0 }),
    })) as { name: string; created_at: string }[];
    return rows.map((r) => {
      // Normalize: if name contains a slash or starts with the prefix, derive the relative form.
      // Otherwise use as-is. The shape is unverified; this handles both full paths and relative names.
      let name = r.name;
      if (name.includes('/')) {
        const prefixWithSlash = `${prefix}/`;
        if (name.startsWith(prefixWithSlash)) {
          name = name.slice(prefixWithSlash.length);
        } else {
          // Full path that does not match prefix - take the last segment
          const parts = name.split('/');
          name = parts[parts.length - 1] ?? r.name;
        }
      }
      return { name, createdAt: r.created_at };
    });
  }

  async remove(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    // The key "prefixes" is unverified against live credentials. This matches what
    // @supabase/supabase-js sends, but the shape must be confirmed as a pre-flip check.
    await this.call(`/object/${PHOTO_BUCKET}`, {
      method: 'DELETE',
      body: JSON.stringify({ prefixes: paths }),
    });
  }
}

/** In-memory, reaches no network, stores nothing on disk. */
export class FakeStorageGateway implements StorageGateway {
  /** Keyed by `${bucket}/${path}` so a label in `shipping-labels` cannot be read back from the photo bucket. */
  private readonly objects = new Map<string, { createdAt: string; bytes: Buffer | null }>();
  private key(bucket: string, path: string): string {
    return `${bucket}/${path}`;
  }

  createSignedUpload(path: string, _contentType: string, bucket: string = PHOTO_BUCKET): Promise<SignedUpload> {
    // Does NOT pre-create the object. Real storage has nothing until the client PUTs the bytes.
    // A test wanting a completed upload calls seed() to simulate the PUT.
    return Promise.resolve({ path, uploadUrl: `https://fake.storage.local/${bucket}/${path}?token=${randomUUID()}` });
  }

  createSignedReadUrls(paths: string[], _ttlSeconds: number, bucket: string = PHOTO_BUCKET): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const p of paths) {
      if (this.objects.has(this.key(bucket, p))) out.set(p, `https://fake.storage.local/${bucket}/${p}?signed=1`);
    }
    return Promise.resolve(out);
  }

  listPrefix(prefix: string): Promise<StoredObject[]> {
    // Returns only DIRECT children of the prefix (not a recursive flat list), matching the
    // pessimistic assumption about real Supabase behavior. For `demandes/u/d/o.jpg`:
    // - listPrefix('demandes') returns { name: 'u', ... } (one user segment)
    // - listPrefix('demandes/u') returns { name: 'd', ... } (one draft segment)
    // - listPrefix('demandes/u/d') returns { name: 'o.jpg', ... } (the leaf object)
    const out: StoredObject[] = [];
    const seen = new Set<string>();

    for (const [key, { createdAt }] of this.objects) {
      if (!key.startsWith(`${PHOTO_BUCKET}/`)) continue;
      const path = key.slice(PHOTO_BUCKET.length + 1);
      if (path.startsWith(`${prefix}/`)) {
        const relative = path.slice(prefix.length + 1);
        const firstSlash = relative.indexOf('/');
        const child = firstSlash === -1 ? relative : relative.substring(0, firstSlash);

        if (!seen.has(child)) {
          seen.add(child);
          out.push({ name: child, createdAt });
        }
      }
    }
    return Promise.resolve(out);
  }

  remove(paths: string[]): Promise<void> {
    for (const p of paths) this.objects.delete(this.key(PHOTO_BUCKET, p));
    return Promise.resolve();
  }

  /** Test-only. Puts an object there without minting an upload URL. */
  seed(path: string, createdAt = new Date(0).toISOString(), bucket?: string): void {
    const b = bucket ?? (path.endsWith('.pdf') ? (process.env.ATTACHMENT_BUCKET ?? 'attachments') : PHOTO_BUCKET);
    this.objects.set(this.key(b, path), { createdAt, bytes: null });
  }

  putObject(bucket: string, path: string, bytes: Buffer, _contentType: string): Promise<void> {
    this.objects.set(this.key(bucket, path), { createdAt: new Date().toISOString(), bytes });
    return Promise.resolve();
  }

  getObject(bucket: string, path: string): Promise<Buffer | null> {
    return Promise.resolve(this.objects.get(this.key(bucket, path))?.bytes ?? null);
  }

  /** Test-only. */
  bytesAt(bucket: string, path: string): Buffer | undefined {
    return this.objects.get(this.key(bucket, path))?.bytes ?? undefined;
  }
}

let instance: StorageGateway | undefined;

/**
 * Absence selects the FAKE, matching `STRIPE_DRIVER` and `SMS_DRIVER`: there the fake is the
 * safe direction because it sends nothing, and here it is safe because it WRITES nothing.
 *
 * 🛑 This is NOT the `registryGateway()` inversion. That one selects the REAL registry when
 * unset, because its fake would grant a real badge on an unverified company. Nothing is
 * granted here, so the ordinary convention applies.
 */
export function storageGateway(): StorageGateway {
  // 🛑 This must NOT delegate to `isStorageConfigured()`, and that is the whole point of the
  // two functions being separate. They answer different questions:
  //
  //   isStorageConfigured()  "may the route proceed at all?"     -- true for `fake` too
  //   storageGateway()       "which implementation does it use?" -- real ONLY for `supabase`
  //
  // Collapsing them is a real bug I made and the tests caught: with one predicate,
  // `STORAGE_DRIVER=fake` counted as configured and therefore selected the REAL gateway, so
  // every integration test hit the network and 500ed.
  if (instance === undefined) {
    const real =
      process.env.STORAGE_DRIVER === 'supabase' &&
      Boolean(process.env.SUPABASE_URL) &&
      Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

    // 🛑 Announce the choice ONCE, because the fake's failure mode is silence.
    //
    // The fake signs nothing, so reads come back as `photoUrls: []`, `photoUrl: null`, and for
    // profile media -- `CF-23`, extended by `CF-24` -- `avatarUrl: null` on `MeResponse`,
    // `RepairerCardDto` and `ConversationListItem` plus `bannerUrl: null` on `MeResponse.repairer`
    // and `RepairerProfileDto`. So every photo-led card renders its empty state, every avatar
    // falls back to initials AND every fiche publique falls back to its motif cover.
    // Nothing errors, nothing logs, and
    // the app looks like it simply has no photos -- which is indistinguishable from the
    // photos genuinely being absent. That cost a real debugging round on 2026-08-21: the
    // seed had uploaded twelve objects and written twelve rows, the DEPLOYED API served
    // them correctly, and the local API returned nothing because its process predated the
    // `.env` change and still held `STORAGE_DRIVER=fake`. A running process serves the
    // environment it booted with; only a controlled deployed-vs-local comparison found it.
    //
    // One line at startup turns that into a visible fact. Name the absent variables rather
    // than saying "not configured", so the reader knows which one to set.
    if (real) {
      new Logger('StorageGateway').log('Using Supabase storage');
    } else {
      const missing = (['STORAGE_DRIVER', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const)
        .filter((k) => (k === 'STORAGE_DRIVER' ? process.env[k] !== 'supabase' : !process.env[k]))
        .join(', ');
      new Logger('StorageGateway').warn(
        `Using the FAKE storage gateway: photo reads will return EMPTY and uploads are refused. Unset or wrong: ${missing}`,
      );
    }

    instance = real ? new SupabaseStorageGateway() : new FakeStorageGateway();
  }
  return instance;
}

/** Test-only. The factory memoises, so a test changing the env must clear it. */
export function __resetStorageGateway(): void {
  instance = undefined;
}
