// apps/api/test/seed-demo-photos.spec.ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPEN_DEMANDES } from '../scripts/seed-demo/cast.mjs';
import {
  CONTENT_TYPE_BY_EXT,
  PATH_EXT_BY_EXT,
  PHOTO_EXTENSIONS,
  photoRowsFor,
  planPhotoPaths,
  resolvePhotoFile,
} from '../scripts/seed-demo/photos.mjs';

const UUID = '11111111-2222-3333-4444-555555555555';

/**
 * `photos.mjs` is JavaScript, so tsc infers `string[]` for `PHOTO_EXTENSIONS` and
 * `{ png: string; jpg: string; jpeg: string }` for the two maps -- and a `string` cannot
 * index those. This guard narrows instead of casting, and it earns its keep: an
 * extension declared in `PHOTO_EXTENSIONS` with no entry in the maps now fails a test
 * by name rather than yielding `undefined` into a Content-Type header.
 */
type PhotoExt = keyof typeof CONTENT_TYPE_BY_EXT;

function isPhotoExt(ext: string): ext is PhotoExt {
  return ext in CONTENT_TYPE_BY_EXT && ext in PATH_EXT_BY_EXT;
}

function asPhotoExt(ext: string): PhotoExt {
  if (!isPhotoExt(ext)) {
    throw new Error(`PHOTO_EXTENSIONS declares "${ext}", which is not a key of both extension maps`);
  }
  return ext;
}

function folderWith(names: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'seed-photos-'));
  for (const n of names) writeFileSync(join(dir, n), 'x');
  return dir;
}

describe('resolving a photo file from disk', () => {
  it('finds a png and reports its content type', () => {
    const dir = folderWith(['smartphone.png']);
    expect(resolvePhotoFile(dir, 'smartphone')).toEqual({
      file: 'smartphone.png',
      ext: 'png',
      pathExt: 'png',
      contentType: 'image/png',
    });
  });

  it('finds a jpg just as well, so neither extension is privileged', () => {
    const dir = folderWith(['console.jpg']);
    expect(resolvePhotoFile(dir, 'console')).toEqual({
      file: 'console.jpg',
      ext: 'jpg',
      pathExt: 'jpg',
      contentType: 'image/jpeg',
    });
  });

  it('maps a .jpeg source to a .jpg PATH, because checkPhotoPaths allows only jpg and png', () => {
    // photoExtension('image/jpeg') returns 'jpg', and the validator's regex is
    // ^demandes/<uid>/<uuid>/<uuid>\.(jpg|png)$ -- so 'jpeg' is a legal FILE
    // extension and an illegal PATH extension. That asymmetry is the whole reason
    // pathExt exists separately from ext.
    const dir = folderWith(['televisions.jpeg']);
    const r = resolvePhotoFile(dir, 'televisions');
    expect(r.ext).toBe('jpeg');
    expect(r.pathExt).toBe('jpg');
    expect(r.contentType).toBe('image/jpeg');
  });

  it('throws naming the slug and every extension tried when nothing matches', () => {
    const dir = folderWith(['smartphone.png']);
    expect(() => resolvePhotoFile(dir, 'televisions')).toThrow(/televisions/);
    expect(() => resolvePhotoFile(dir, 'televisions')).toThrow(/png/);
  });

  it('maps every supported extension to a content type the bucket accepts', () => {
    for (const raw of PHOTO_EXTENSIONS) {
      const ext = asPhotoExt(raw);
      expect(['image/png', 'image/jpeg']).toContain(CONTENT_TYPE_BY_EXT[ext]);
      expect(['png', 'jpg']).toContain(PATH_EXT_BY_EXT[ext]);
    }
  });

  it('resolves a file for every category the OPEN demandes use', () => {
    const dir = folderWith(OPEN_DEMANDES.map((d) => `${d.categorySlug}.png`));
    for (const d of OPEN_DEMANDES) {
      expect(resolvePhotoFile(dir, d.categorySlug).file).toBe(`${d.categorySlug}.png`);
    }
  });
});

describe('planned storage paths satisfy checkPhotoPaths', () => {
  const plans = (ext: PhotoExt = 'png') =>
    planPhotoPaths({
      demandes: [
        {
          id: 'd-1',
          categorySlug: 'smartphone',
          authorUserId: 'u-1',
          file: `smartphone.${ext}`,
          pathExt: PATH_EXT_BY_EXT[ext],
          contentType: CONTENT_TYPE_BY_EXT[ext],
        },
      ],
      draftIdFor: () => UUID,
      objectIdFor: () => UUID,
    });

  it('builds exactly four segments under demandes/', () => {
    const [{ row }] = plans();
    expect(row.storagePath.split('/')).toHaveLength(4);
    expect(row.storagePath.startsWith('demandes/')).toBe(true);
  });

  it('puts the demande AUTHOR in the path, not the seeder', () => {
    expect(plans()[0].row.storagePath).toContain('u-1');
  });

  it('carries the resolved path extension, not a hardcoded one', () => {
    expect(plans('png')[0].row.storagePath.endsWith('.png')).toBe(true);
    expect(plans('jpg')[0].row.storagePath.endsWith('.jpg')).toBe(true);
    expect(plans('jpeg')[0].row.storagePath.endsWith('.jpg')).toBe(true);
  });

  it('keeps the path suffix and the content type in agreement', () => {
    for (const raw of PHOTO_EXTENSIONS) {
      const ext = asPhotoExt(raw);
      const [plan] = plans(ext);
      expect(plan.upload.contentType).toBe(CONTENT_TYPE_BY_EXT[ext]);
      expect(plan.row.storagePath.endsWith(`.${PATH_EXT_BY_EXT[ext]}`)).toBe(true);
    }
  });

  it('uploads to the same path it stores, so the read path signs an object that exists', () => {
    for (const raw of PHOTO_EXTENSIONS) {
      const ext = asPhotoExt(raw);
      const [plan] = plans(ext);
      expect(plan.upload.storagePath).toBe(plan.row.storagePath);
    }
  });

  it('matches the API validator regex exactly', () => {
    const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
    const shape = new RegExp(`^demandes/u-1/${uuid}/${uuid}\\.(jpg|png)$`);
    for (const raw of PHOTO_EXTENSIONS) {
      const ext = asPhotoExt(raw);
      expect(plans(ext)[0].row.storagePath).toMatch(shape);
    }
  });

  it('gives one photo per demande at sortOrder 0', () => {
    expect(plans()).toHaveLength(1);
    expect(plans()[0].row.sortOrder).toBe(0);
  });
});

describe('the row handed to demandePhoto.createMany carries ONLY columns', () => {
  const plan = () =>
    planPhotoPaths({
      demandes: [
        {
          id: 'd-1',
          categorySlug: 'smartphone',
          authorUserId: 'u-1',
          file: 'smartphone.png',
          pathExt: 'png',
          contentType: 'image/png',
        },
      ],
      draftIdFor: () => UUID,
      objectIdFor: () => UUID,
    })[0];

  /**
   * 🛑 This is the assertion that matters, and asserting the EXACT key set is the only
   * form of it that works. An earlier version of this file asserted that `localFile` and
   * `contentType` were PRESENT on the row, so the suite actively blessed the defect:
   * neither is a `DemandePhoto` column, `createMany` answers an unknown argument with a
   * PrismaClientValidationError, and that aborts the whole Phase 2 transaction -- after
   * `uploadPhotos` has already put twelve objects in the bucket.
   *
   * `id` is deliberately absent: it is the fourth column of the model and it is
   * `@default(uuid())`, so Postgres supplies it. The other planned tables pre-generate
   * ids only because later rows reference them.
   */
  it('is exactly { demandeId, sortOrder, storagePath }', () => {
    expect(Object.keys(plan().row).sort()).toEqual(['demandeId', 'sortOrder', 'storagePath']);
  });

  it('keeps localFile and contentType on the upload half, where the uploader needs them', () => {
    expect(Object.keys(plan().upload).sort()).toEqual(['contentType', 'localFile', 'storagePath']);
  });

  it('strips to the row half through photoRowsFor, which is what index.mjs hands Phase 2', () => {
    const rows = photoRowsFor([plan(), plan()]);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['demandeId', 'sortOrder', 'storagePath']);
    }
  });
});

describe('JPEG wins when a folder holds both formats', () => {
  // The order of PHOTO_EXTENSIONS is load-bearing, not cosmetic. The owner's folder holds
  // both smartphone.png (2.3 MB) and smartphone.jpg (112 KB) after the 2026-08-21 re-encode,
  // and picking the PNG is what made photos load slowly on his phone: ~12 MB to paint six
  // 150x90 tiles. A plain membership test would pass either way, so assert the WINNER.
  it('prefers .jpg over .png for the same slug', () => {
    const dir = mkdtempSync(join(tmpdir(), 'seed-photos-both-'));
    writeFileSync(join(dir, 'smartphone.png'), 'x');
    writeFileSync(join(dir, 'smartphone.jpg'), 'x');
    const r = resolvePhotoFile(dir, 'smartphone');
    expect(r.file).toBe('smartphone.jpg');
    expect(r.contentType).toBe('image/jpeg');
  });

  it('still falls back to .png when that is all there is', () => {
    const dir = mkdtempSync(join(tmpdir(), 'seed-photos-png-'));
    writeFileSync(join(dir, 'console.png'), 'x');
    expect(resolvePhotoFile(dir, 'console').file).toBe('console.png');
  });

  it('lists jpg before png in PHOTO_EXTENSIONS, which is what makes the above hold', () => {
    expect(PHOTO_EXTENSIONS.indexOf('jpg')).toBeLessThan(PHOTO_EXTENSIONS.indexOf('png'));
  });
});
