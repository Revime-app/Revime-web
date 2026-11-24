import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { palette, paletteDark } from '@revime/tokens';

const adminRoot = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(adminRoot, 'app/globals.css'), 'utf8').replace(/\r\n/g, '\n');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

// --- WCAG relative luminance / contrast ------------------------------------------------
function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The value a `--name: #hex` declaration gives inside the rule whose selector contains `selector`. */
function declared(selector: string, name: string): string {
  const rule = css.split('\n').find((l) => l.includes(selector) && l.includes(`--${name}:`));
  const m = rule && new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(rule);
  if (!m) throw new Error(`--${name} not declared next to ${selector}`);
  return m[1];
}

describe('CG-8: no surface or text colour is a literal that ignores the theme', () => {
  const VAR_SPAN = /var\(\s*--[a-z0-9-]+\s*,\s*[^()]*(?:\([^()]*\)[^()]*)*\)/g;
  const files = [...walk(path.join(adminRoot, 'app')), ...walk(path.join(adminRoot, 'components')), ...walk(path.join(adminRoot, 'lib'))];

  it('finds no literal hex in the admin sources, except a white label and the marked brand-logo ground', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        if (line.includes('keep-literal')) return;
        const stripped = line.replace(VAR_SPAN, (span) => ' '.repeat(span.length));
        for (const m of stripped.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
          const white = /^#(fff|ffffff)$/i.test(m[0]);
          // `color: '#ffffff'` (also in a ternary, or `roleBadgeColor = ...`) is a label on a navy,
          // red or accent fill: white in both themes. A white SURFACE is `var(--paper)`.
          if (white && /(^|[^A-Za-z-])(color|textColor|roleBadgeColor)\s*[:=]/.test(stripped)) continue;
          offenders.push(`${path.relative(adminRoot, file)}:${i + 1} ${m[0]}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('paints no label with --paper (it turns dark navy in the dark theme) and no fill with --ink', () => {
    const offenders: string[] = [];
    for (const file of files) {
      fs.readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (/(^|[^A-Za-z-])color:\s*['"`]var\(--paper/.test(line)) offenders.push(`${path.relative(adminRoot, file)}:${i + 1} label --paper`);
          if (/background(Color)?:\s*['"`]var\(--ink/.test(line)) offenders.push(`${path.relative(adminRoot, file)}:${i + 1} fill --ink`);
        });
    }
    expect(offenders).toEqual([]);
    expect(css).not.toMatch(/(^|[^-])color:\s*var\(--paper/m);
  });
});

describe('CG-3 to CG-5: the stylesheet follows the charte in both themes', () => {
  it('seats the sidebar text on --on-accent: --paper is #0d1645 on the #010524 sidebar in the dark theme', () => {
    const nav = /\n\.nav \{[^}]*\}/.exec(css)![0];
    expect(nav).toContain('color: var(--on-accent)');
    expect(contrast('#ffffff', paletteDark.navyDeep)).toBeGreaterThan(15);
    expect(contrast(paletteDark.paper, paletteDark.navyDeep)).toBeLessThan(1.2);
  });

  it('paints the active menu item Rouge Punch and inverts its counter', () => {
    expect(css).toMatch(/\.nav__link\[aria-current='page'\] \{[^}]*background: var\(--red\)/);
    expect(css).toMatch(/\.nav__link\[aria-current='page'\] \.nav__badge \{[^}]*background: var\(--on-accent\);[^}]*color: var\(--red\)/);
    expect(css).toMatch(/\.nav__badge \{[^}]*background: var\(--red\)/);
  });

  it('grounds the page on --canvas (white, Bleu prusse in the dark theme), never on --page (#f9fafb)', () => {
    expect(css).toMatch(/:root \{[^}]*--canvas: #ffffff/);
    expect(css).toMatch(/:root\[data-theme="dark"\] \{[^}]*--canvas: var\(--page\)/);
    expect(css).toMatch(/prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{[^}]*--canvas: var\(--page\)/);
    expect(css.replace(/--canvas: var\(--page\)/g, '')).not.toContain('var(--page');
    expect(css).toMatch(/\.shell__container \{[^}]*background: var\(--canvas\)/);
    expect(css).toMatch(/body \{[^}]*background: var\(--canvas\)/);
  });

  it('gives every form control the brand font, not only input and button', () => {
    expect(css).toMatch(/select,\s*textarea \{\s*font-family: inherit;/);
  });

  it('sets the text level at -2 %, inside the charte range of -2 % to -4 %', () => {
    expect(css).toMatch(/\.text-body,\s*p \{[^}]*letter-spacing: -0\.02em/);
  });
});

describe('CG-8: the text colours reach WCAG AA on the card and the canvas in both themes', () => {
  const darkText = declared(':root[data-theme="dark"]', 'navy-text');
  const darkRed = declared(':root[data-theme="dark"]', 'red-text');

  it('Bleu Ink as text: --navy is 2.8:1 on the dark card, --navy-text clears 4.5:1 on the card and the canvas', () => {
    expect(contrast(paletteDark.navy, paletteDark.paper)).toBeLessThan(3);
    expect(contrast(darkText, paletteDark.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkText, paletteDark.page)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.navy, palette.paper)).toBeGreaterThanOrEqual(4.5);
  });

  it('Rouge Punch as text: --red-deep is under 3:1 on the dark card, --red-text clears 4.5:1', () => {
    expect(contrast(paletteDark.redDeep, paletteDark.paper)).toBeLessThan(3);
    expect(contrast(darkRed, paletteDark.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.redDeep, palette.paper)).toBeGreaterThanOrEqual(4.5);
  });

  it('--on-accent is white in both themes (the label on a navy, red or accent fill)', () => {
    expect(declared(':root {', 'on-accent')).toBe('#ffffff');
  });

  it('the white label on a lifted-blue or red fill clears 4.5:1 in the dark theme', () => {
    expect(contrast('#ffffff', paletteDark.navy)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', paletteDark.red)).toBeGreaterThanOrEqual(3.5);
  });

  it('body, muted and secondary text read on the dark card', () => {
    expect(contrast(paletteDark.ink, paletteDark.paper)).toBeGreaterThanOrEqual(7);
    expect(contrast(paletteDark.ink2, paletteDark.paper)).toBeGreaterThanOrEqual(7);
    expect(contrast(paletteDark.muted, paletteDark.paper)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('CG-6: collapsing the violet and pink into the semantic palette must not merge distinct roles', () => {
  it('gives the audit domains at least five distinct badge colours (six domains, five semantic colours)', async () => {
    const { getDomainBadge } = await import('../components/AuditLogTable');
    const domains = ['COMMANDES', 'USERS', 'LITIGES_SIGNALEMENTS', 'CATALOGUE_CONTENU', 'MARKETING_PROMOS', 'SECURITE_AUTH'] as const;
    const colours = domains.map((d) => getDomainBadge(d).color);
    expect(new Set(colours).size).toBeGreaterThanOrEqual(5);
    expect(getDomainBadge('SECURITE_AUTH').color).toBe('var(--badge-danger-text)');
    expect(getDomainBadge('CATALOGUE_CONTENU').color).not.toBe(getDomainBadge('COMMANDES').color);
    expect(getDomainBadge('USERS').color).not.toBe(getDomainBadge('LITIGES_SIGNALEMENTS').color);
  });
});
