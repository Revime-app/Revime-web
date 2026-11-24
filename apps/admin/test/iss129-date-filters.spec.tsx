import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import * as fs from 'fs';
import * as path from 'path';
import DemandesPage from '../app/demandes/page';

// ISS-129: on /demandes the two date filters were bare `dd-mm-yyyy` fields stacked at full width
// with nothing saying which is « from » and which is « to » (and no accessible name at all). The
// global `input { width: 100% }` stretched them, and `.filters` only restyles padding and border.
const ROOT = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8').replace(/\r\n/g, '\n');

function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  return m ? m[1] : '';
}

describe('ISS-129: /demandes date range filter', () => {
  const html = renderToString(<DemandesPage />);
  const dates = [...html.matchAll(/<input[^>]*type="date"[^>]*>/g)].map((m) => m[0]);

  it('renders the two date inputs', () => {
    expect(dates).toHaveLength(2);
  });

  it('labels them « Du » and « Au », each label tied to its input', () => {
    for (const [i, text] of ['Du', 'Au'].entries()) {
      const id = dates[i].match(/\bid="([^"]+)"/)?.[1];
      expect(id, `date input ${i} has an id`).toBeTruthy();
      expect(html).toMatch(new RegExp(`<label[^>]*for="${id}"[^>]*>${text}</label>`));
    }
  });

  it('leaves the visible label as the accessible name (no aria-label that would override Du)', () => {
    for (const d of dates) expect(d).not.toContain('aria-label');
  });

  it('groups the pair as one filter named after what it filters, the creation date', () => {
    const group = html.match(/<div[^>]*class="filters__range"[^>]*>/)?.[0] ?? '';
    expect(group).toContain('role="group"');
    expect(group).toContain('aria-label="Date de création"');
  });

  it('does not stretch a date input across the row inside .filters', () => {
    expect(block('.filters input[type="date"]')).toMatch(/width:\s*auto/);
  });

  it('lays the pair out inline, label beside field', () => {
    expect(block('.filters__range')).toMatch(/display:\s*inline-flex/);
    expect(block('.filters__range')).toMatch(/align-items:\s*center/);
  });
});

describe('ISS-129: every date input in the admin has an accessible name', () => {
  const walk = (d: string, o: string[] = []): string[] => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, o);
      else if (/\.tsx$/.test(e.name)) o.push(p);
    }
    return o;
  };

  it('has no type="date" input without a wrapping label, an aria-label or an id for a label', () => {
    const offenders: string[] = [];
    for (const f of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))]) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/<input\b/g)) {
        let depth = 0;
        let end = m.index!;
        for (; end < src.length; end++) {
          const c = src[end];
          if (c === '{') depth++;
          else if (c === '}') depth--;
          else if (c === '>' && depth === 0) break;
        }
        const tag = src.slice(m.index!, end);
        // A <label> that wraps the input names it implicitly.
        const before = src.slice(0, m.index!);
        const wrapped = before.lastIndexOf('<label') > before.lastIndexOf('</label>');
        if (/type=["']date["']/.test(tag) && !wrapped && !/aria-label=|aria-labelledby=|\bid=/.test(tag)) {
          offenders.push(`${path.relative(ROOT, f)}:${src.slice(0, m.index).split('\n').length}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
