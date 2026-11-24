import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { palette, paletteDark, radii, semanticBadges } from '@revime/tokens';

// ISS-130: dark mode. The owner's screenshots: the active tab of Litiges has no visible label,
// selects show black text on a dark field (or a white field on Demandes), and the calendar icon
// of a date field is black on navy. Three causes, all in how the theme reaches the page:
//  1. text set in `--navy-deep` (#010524 in dark, 1.0:1 on the page), `--navy` (2.8:1) and
//     `--red-deep` (2.7:1): the stylesheet already defines `--navy-text` and `--red-text` for this;
//  2. no `color-scheme`, so every native control (date picker icon, select popup, scrollbars) stays light;
//  3. `select` and `textarea` have no colours of their own and take the browser's black on white.
const ROOT = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8').replace(/\r\n/g, '\n');

function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  return m ? m[1] : '';
}

// ---- colour maths -------------------------------------------------------------------------
const camel = (s: string) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
function resolveDark(value: string): string {
  const v = value.trim();
  const ref = v.match(/^var\(--([a-z0-9-]+)\)$/);
  if (ref) {
    const key = camel(ref[1]) as keyof typeof paletteDark;
    if (!(key in paletteDark)) throw new Error(`no dark token ${ref[1]}`);
    return paletteDark[key];
  }
  return v;
}
function lum(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function darkToken(name: string): string {
  const dark = css.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/)?.[1] ?? '';
  const m = dark.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`--${name} is not defined for the dark theme`);
  return resolveDark(m[1]);
}

describe('ISS-130: text tokens are readable on the dark surfaces', () => {
  const surfaces = { paper: paletteDark.paper, page: paletteDark.page };
  for (const token of ['navy-text', 'red-text', 'navy-deep-text']) {
    it(`--${token} reaches 4.5:1 on both the card and the page in the dark theme`, () => {
      const colour = darkToken(token);
      for (const [name, bg] of Object.entries(surfaces)) {
        expect(contrast(colour, bg), `${token} ${colour} on ${name}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it('keeps the light theme exactly as it was: --navy-deep-text is --navy-deep', () => {
    expect(css).toMatch(/:root\s*\{[^}]*--navy-deep-text:\s*var\(--navy-deep\)/);
  });

  it('sets --navy-deep-text in the prefers-color-scheme fallback too, not only for data-theme', () => {
    const media = css.match(/@media \(prefers-color-scheme: dark\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(media).toMatch(/--navy-deep-text:/);
    expect(media).toMatch(/--navy-text:/);
  });
});

describe('ISS-130: no text is set in a token that is unreadable in dark mode', () => {
  const walk = (d: string, o: string[] = []): string[] => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, o);
      else if (/\.tsx?$/.test(e.name)) o.push(p);
    }
    return o;
  };
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

  /** The whole value of each `color:` property, which may be a ternary over several lines. */
  function colorExpressions(src: string): { line: number; expr: string }[] {
    const out: { line: number; expr: string }[] = [];
    for (const m of src.matchAll(/(?<![A-Za-z-])color:\s*/g)) {
      let i = m.index! + m[0].length;
      const start = i;
      let depth = 0;
      let quote: string | null = null;
      for (; i < src.length; i++) {
        const c = src[i];
        if (quote) {
          if (c === '\\') i++;
          else if (c === quote) quote = null;
        } else if (c === "'" || c === '"' || c === '`') quote = c;
        else if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) {
          if (--depth < 0) break;
        } else if ((c === ',' || c === ';') && depth === 0) break;
      }
      out.push({ line: src.slice(0, m.index!).split('\n').length, expr: src.slice(start, i) });
    }
    return out;
  }

  it('uses --navy-text, --navy-deep-text and --red-text for text, never the fill tokens', () => {
    const offenders: string[] = [];
    for (const f of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))]) {
      for (const { line, expr } of colorExpressions(strip(fs.readFileSync(f, 'utf8')))) {
        if (/var\(--(navy-deep|navy|red-deep)[,)]/.test(expr)) offenders.push(`${path.relative(ROOT, f)}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('reads a ternary that runs over several lines (the check is not line-bound)', () => {
    const src = "style={{ color: a\n ? 'var(--orange)'\n : 'var(--navy, #25324f)', margin: 0 }}";
    const [hit] = colorExpressions(src);
    expect(hit.expr).toContain('var(--navy, #25324f)');
    expect(hit.expr).not.toContain('margin');
  });
});

describe('ISS-130: every theme token used in the admin exists', () => {
  // A `var(--x, #fallback)` whose --x is defined nowhere always takes the fallback, which is a
  // light-theme colour: pale text, near-white boxes and pink borders on the dark theme.
  const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  const defined = new Set<string>([
    ...[...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
    ...Object.keys(paletteDark).map((k) => `--${kebab(k)}`),
    ...Object.keys(palette).map((k) => `--${kebab(k)}`),
    '--accent', '--accent-deep', '--accent-soft',
    ...Object.keys(radii).map((k) => `--r-${k}`),
    ...Object.keys(semanticBadges).flatMap((r) => ['text', 'bg', 'border'].map((p) => `--badge-${r}-${p}`)),
    '--font-google-sans', // injected by next/font on <html>
  ]);
  const walk = (d: string, o: string[] = []): string[] => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, o);
      else if (/\.tsx?$/.test(e.name)) o.push(p);
    }
    return o;
  };

  it('has no var(--token) that is defined nowhere', () => {
    const undefinedUses = new Map<string, string[]>();
    for (const f of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components')), ...walk(path.join(ROOT, 'lib'))]) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/var\((--[a-z0-9-]+)/g)) {
        if (!defined.has(m[1])) {
          const where = `${path.relative(ROOT, f)}:${src.slice(0, m.index!).split('\n').length}`;
          undefinedUses.set(m[1], [...(undefinedUses.get(m[1]) ?? []), where]);
        }
      }
    }
    expect(Object.fromEntries(undefinedUses)).toEqual({});
  });
});

describe('ISS-130: native controls follow the theme', () => {
  it('declares color-scheme light on the root and dark for the dark theme', () => {
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light/);
    expect(css).toMatch(/:root\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark/);
  });

  it('declares color-scheme dark in the system-preference fallback as well', () => {
    const media = css.match(/@media \(prefers-color-scheme: dark\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(media).toMatch(/color-scheme:\s*dark/);
  });

  it('gives select and textarea the theme surface and ink instead of the browser black on white', () => {
    const b = block('select,\ntextarea');
    expect(b).toMatch(/background:\s*var\(--paper/);
    expect(b).toMatch(/color:\s*var\(--ink/);
    expect(b).toMatch(/border:\s*1px solid var\(--line/);
  });

  it('themes the options inside a select list', () => {
    const b = block('option');
    expect(b).toMatch(/background:\s*var\(--paper/);
    expect(b).toMatch(/color:\s*var\(--ink/);
  });

  it('draws placeholder text in the muted token, readable in both themes', () => {
    const b = block('::placeholder');
    expect(b).toMatch(/color:\s*var\(--muted/);
    expect(b).toMatch(/opacity:\s*1/);
  });
});

describe('ISS-130: the newly defined tokens follow the theme instead of fixing a colour', () => {
  const rootBlock = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? '';

  for (const [token, target] of [
    ['ink-muted', 'muted'],
    ['bg-subtle', 'mist'],
    ['red-line', 'badge-danger-border'],
    ['amber-line', 'badge-warning-border'],
  ]) {
    it(`--${token} is a reference to --${target}, so it switches with the theme`, () => {
      expect(rootBlock).toMatch(new RegExp(`--${token}:\\s*var\\(--${target}\\)`));
    });
  }

  it('--ink-muted is readable on the dark card and page (4.5:1)', () => {
    for (const bg of [paletteDark.paper, paletteDark.page]) {
      expect(contrast(paletteDark.muted, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
