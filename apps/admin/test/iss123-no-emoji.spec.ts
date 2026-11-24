import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ISS-123: the admin dashboard carries no emoji. Icons are Lucide components, not glyphs in
// strings. Plain typographic symbols (✕ ✓ ★ ☆ arrows, bullets, « » —) are text, not emoji, and
// stay. Comments are not UI and are skipped (the 🛑 markers in dev comments are fine).
const ROOT = path.resolve(__dirname, '..');
const DIRS = ['app', 'components', 'lib'];

// Emoji presentation, a pictograph forced to emoji by U+FE0F, a keycap, and the two
// text-style symbols that browsers draw as emoji (⚠ U+26A0, ℹ U+2139, ⭐ is Emoji_Presentation).
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️|⃣|[⚠ℹ]/gu;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

describe('ISS-123: no emoji in the admin dashboard source', () => {
  const files = DIRS.flatMap((d) => walk(path.join(ROOT, d)));

  it('scans a believable number of files (guards against a path typo passing vacuously)', () => {
    expect(files.length).toBeGreaterThan(150);
  });

  it('finds no emoji outside comments', () => {
    const hits: string[] = [];
    for (const f of files) {
      stripComments(fs.readFileSync(f, 'utf8'))
        .split(/\r?\n/)
        .forEach((line, i) => {
          const m = line.match(EMOJI);
          if (m) hits.push(`${path.relative(ROOT, f)}:${i + 1} ${m.join('')}`);
        });
    }
    expect(hits).toEqual([]);
  });

  it('recognises the glyphs it is meant to catch', () => {
    for (const g of ['📦', '⚖️', '⚠️', '⚠', 'ℹ️', '⭐', '🥇', '✂️', '↩️', '⏳']) {
      expect(g.match(EMOJI), g).not.toBeNull();
    }
    for (const g of ['✕', '✓', '★', '☆', '→', '←', '↗', '↔', '▲', '•', '≤', '«']) {
      expect(g.match(EMOJI), g).toBeNull();
    }
  });
});
