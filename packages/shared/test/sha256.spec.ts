import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/sha256.js';

const reference = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

describe('sha256Hex (pure TypeScript, runs in React Native)', () => {
  it('matches the published test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('equals Node crypto on every padding boundary (0 to 200 bytes)', () => {
    for (let n = 0; n <= 200; n += 1) {
      const text = 'a'.repeat(n);
      expect(sha256Hex(text), `length ${n}`).toBe(reference(text));
    }
  });

  it('equals Node crypto on multi-byte UTF-8, emoji and a long legal text', () => {
    const samples = [
      'Écran fissuré à droite — prix 107,40 €',
      'L’utilisateur accepte les CGU',
      '日本語のテキスト',
      'emoji 😀 and a lone high surrogate \ud83d end',
      "user-1|CGU_ACCEPTANCE|2026-10-11T03:37:06.000Z|CHECKBOX|" + 'x'.repeat(5000) + "||2026-10-10|",
    ];
    for (const text of samples) expect(sha256Hex(text)).toBe(reference(text));
  });
});

describe('the shared package stays loadable in React Native', () => {
  it('no source file imports a node: module', () => {
    const dir = join(__dirname, '..', 'src');
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => /from\s+['"]node:|require\(\s*['"]node:/.test(readFileSync(join(dir, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
