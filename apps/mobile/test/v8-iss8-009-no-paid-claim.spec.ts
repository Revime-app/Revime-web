import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * V8 `ISS8-009` (owner: « Yes, fix it », 2026-11-17). After V8 B2, a client can validate an order whose
 * payout Revime HOLDS until the réparateur finishes his setup. Copy that tells the client, in the past
 * tense, that the money WAS paid to the réparateur is then false. The review screen said exactly that
 * (« Votre paiement a été versé au réparateur. »). Future or conditional wording (« sera versé…
 * après votre validation ») stays true and is allowed.
 *
 * `src/lib/legal/` is excluded: those are the client's own legal documents, reproduced verbatim.
 */
const ROOT = path.resolve(__dirname, '..');
const LEGAL = path.join(ROOT, 'src', 'lib', 'legal');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (full.startsWith(LEGAL)) return [];
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(tsx?|ts)$/.test(full) ? [full] : [];
  });
}

/** Past-tense « paid to the réparateur » claims, whitespace-tolerant (JSX wraps lines). */
const PAID_CLAIM = /(a\s+été|ont\s+été)\s+versée?s?\s+(au|à\s+votre)\s+réparateur/i;

describe('V8 ISS8-009: no app copy claims the réparateur was already paid', () => {
  const files = [...sourceFiles(path.join(ROOT, 'app')), ...sourceFiles(path.join(ROOT, 'src'))];

  it('scans the app (guards the scan itself)', () => {
    expect(files.some((f) => f.endsWith(path.join('avis', '[commandeId].tsx')))).toBe(true);
  });

  it('finds no « a été versé au réparateur » or « ont été versés à votre réparateur »', () => {
    const offenders = files
      .filter((f) => PAID_CLAIM.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')))
      .map((f) => path.relative(ROOT, f));
    expect(offenders).toEqual([]);
  });
});
