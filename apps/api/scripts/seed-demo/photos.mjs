// apps/api/scripts/seed-demo/photos.mjs
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

/**
 * Mirrors apps/api/src/storage/photo-paths.ts, which is TypeScript under src/ and not
 * importable here. Exported so `teardown.mjs` names the bucket from here rather than
 * repeating the literal: two copies of a bucket name is one rename away from a cleanup
 * that deletes nothing and says so.
 */
export const PHOTO_BUCKET = 'demande-photos';

/**
 * What we accept on disk, **in preference order — JPEG first, and that order is the point.**
 *
 * `resolvePhotoFile` returns the first extension it finds, so this list decides which file
 * wins when a folder holds both `smartphone.jpg` and `smartphone.png`. It used to try `png`
 * first and that was measurably wrong: the twelve source PNGs averaged **2.1 MB** (1.6-2.9 MB,
 * 24.9 MB total), so the réparateur home downloaded roughly **12 MB to paint six 150x90
 * tiles**, and the owner reported photos loading slowly from his phone. Re-encoded to JPEG at
 * 1200px wide, quality 82, the same twelve are **1.3 MB total — 19.5x smaller** — and 1200px
 * is still full resolution for a 400pt-wide screen at 3x.
 *
 * A PNG is the wrong container for a photograph: it is lossless, so it cannot discard the
 * sensor noise and gradients that a JPEG throws away for free. PNG stays supported because
 * `checkPhotoPaths` allows it and a user upload may legitimately be one.
 *
 * Supabase's own image transformation endpoint would make this moot by resizing server-side,
 * and it was tested rather than assumed: it answers **403 on this plan** (a paid feature),
 * while the plain object fetch beside it answers 200. So the bytes have to be right at upload.
 */
export const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png'];

export const CONTENT_TYPE_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

/**
 * The extension the STORAGE PATH must carry, which is not always the file's own.
 *
 * `checkPhotoPaths` tests `^demandes/<uid>/<uuid>/<uuid>\.(jpg|png)$` and
 * `photoExtension('image/jpeg')` returns 'jpg' -- so `jpeg` is a legal file extension
 * and an ILLEGAL path extension. Collapsing the two would store a path the API's own
 * validator rejects.
 */
export const PATH_EXT_BY_EXT = { png: 'png', jpg: 'jpg', jpeg: 'jpg' };

/**
 * IMPURE: reads the directory. Resolves one category's image without assuming a
 * format, because the twelve supplied files are PNG and an earlier draft of this
 * module hardcoded `.jpg` in three places at once.
 */
export function resolvePhotoFile(folder, categorySlug) {
  for (const ext of PHOTO_EXTENSIONS) {
    const file = `${categorySlug}.${ext}`;
    if (existsSync(join(folder, file))) {
      return { file, ext, pathExt: PATH_EXT_BY_EXT[ext], contentType: CONTENT_TYPE_BY_EXT[ext] };
    }
  }
  throw new Error(
    `No image for category "${categorySlug}" in ${folder}. Tried: ${PHOTO_EXTENSIONS.map((e) => `${categorySlug}.${e}`).join(', ')}`,
  );
}

/**
 * PURE. Each demande arrives with its file already resolved.
 *
 * The path must satisfy checkPhotoPaths: exactly four segments,
 * demandes/<userId>/<draftId>/<objectId>.<jpg|png>, with uuid-shaped draft and object
 * segments. The userId is the DEMANDE'S AUTHOR, not the seeder, so the object sits
 * where the app would have put it and the orphan-purge cron's prefix logic keeps working.
 *
 * 🛑 Returns TWO SHAPES, deliberately separated rather than one flat row the callers
 * pick fields out of. `upload` is what the uploader needs; `row` is what Prisma gets,
 * and it carries nothing else. `localFile` and `contentType` are NOT `DemandePhoto`
 * columns -- the model is { id, demandeId, storagePath, sortOrder } -- and
 * `createMany` answers an unknown argument with a PrismaClientValidationError that
 * aborts the ENTIRE Phase 2 transaction. That abort lands after `uploadPhotos` has
 * already run, so the failure mode is twelve objects in the bucket with no rows
 * pointing at them. The separation is structural so no future caller can leak an
 * upload field into an insert.
 */
export function planPhotoPaths({ demandes, draftIdFor = randomUUID, objectIdFor = randomUUID }) {
  return demandes.map((d) => {
    const draftId = draftIdFor();
    const objectId = objectIdFor();
    const storagePath = `demandes/${d.authorUserId}/${draftId}/${objectId}.${d.pathExt}`;
    return {
      /** For `uploadPhotos`. Never handed to Prisma. */
      upload: { localFile: d.file, contentType: d.contentType, storagePath },
      /**
       * For `demandePhoto.createMany`, and this is the whole insert payload. `id` is
       * absent on purpose: it is `@default(uuid())` in the schema, so Postgres fills
       * it, unlike the history rows whose ids are pre-generated because later rows
       * reference them.
       */
      row: { demandeId: d.id, storagePath, sortOrder: 0 },
    };
  });
}

/** The Prisma half of a planned photo, for the transaction array. */
export function photoRowsFor(plans) {
  return plans.map((p) => p.row);
}

/**
 * PUTs each object with the service_role key. The API's own gateway mints SIGNED
 * upload URLs because it hands them to a phone it does not trust; this script holds
 * the service key itself, so it uploads directly and skips that round trip.
 *
 * Each row sends its OWN content type. A single hardcoded one would store objects
 * whose declared type disagrees with their path suffix, and the read path signs the
 * stored path while the client trusts the stored type.
 */
export async function uploadPhotos(plans, { supabaseUrl, serviceRoleKey, folder, log }) {
  const base = `${supabaseUrl.replace(/\/+$/, '')}/storage/v1`;
  for (const { upload } of plans) {
    const bytes = readFileSync(join(folder, upload.localFile));
    const res = await fetch(`${base}/object/${PHOTO_BUCKET}/${upload.storagePath}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${serviceRoleKey}`,
        'content-type': upload.contentType,
        'x-upsert': 'true',
      },
      body: bytes,
    });
    if (!res.ok) throw new Error(`upload ${upload.localFile} -> ${res.status} ${await res.text()}`);
    log(`uploaded ${upload.localFile} (${upload.contentType}) to ${upload.storagePath}`);
  }
}
