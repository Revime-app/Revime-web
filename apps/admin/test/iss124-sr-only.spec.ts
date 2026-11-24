import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ISS-124: the header theme switcher printed « Thème sélectionné : Clair » on screen, wrapped over
// three lines beside the icon. ThemeToggle marks that text `className="sr-only"`, a Tailwind
// utility, and the admin has no Tailwind and no rule of its own, so the text was never hidden.
const ROOT = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  return m ? m[1] : '';
}

describe('ISS-124: visually hidden text is actually hidden', () => {
  it('defines .sr-only as the standard visually-hidden pattern', () => {
    const b = block('.sr-only');
    expect(b).not.toBe('');
    expect(b).toMatch(/position:\s*absolute/);
    expect(b).toMatch(/width:\s*1px/);
    expect(b).toMatch(/height:\s*1px/);
    expect(b).toMatch(/overflow:\s*hidden/);
    expect(b).toMatch(/clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
    expect(b).toMatch(/white-space:\s*nowrap/);
  });

  it('does not collapse the text with display:none, which would hide it from screen readers too', () => {
    expect(block('.sr-only')).not.toMatch(/display:\s*none|visibility:\s*hidden/);
  });

  it('has a rule for the sr-only class the markup uses', () => {
    const used = new Set<string>();
    for (const f of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))]) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/className="([^"]*\bsr-only\b[^"]*)"/g)) {
        used.add(m[1]);
      }
    }
    expect(used.size).toBeGreaterThan(0);
    expect(css).toMatch(/\.sr-only\s*\{/);
  });
});
