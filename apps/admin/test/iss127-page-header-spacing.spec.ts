import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ISS-127: on /offres and /signalements the subtitle printed over the title. Both pages put
// `marginTop: '-12px'` on the paragraph under the `<h1>`, to pull it up against a heading margin;
// the global reset (`* { margin: 0 }`) removed that margin long ago, so the -12px now drags the
// paragraph up INTO the 32px-high title line.
const ROOT = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8').replace(/\r\n/g, '\n');

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

describe('ISS-127: the subtitle under a page title never overlaps it', () => {
  it('has no paragraph directly under an <h1> that is pulled up with a negative top margin', () => {
    const offenders: string[] = [];
    for (const f of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))]) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/<\/h1>\s*<p\b[^>]*?marginTop:\s*['"]?\s*-\s*\d/g)) {
        offenders.push(`${path.relative(ROOT, f)}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('gives every page header the same small gap between the title and its subtitle', () => {
    expect(block('.page > h1 + p')).toMatch(/margin-top:\s*4px/);
  });

  it('keeps the title taller than its own font, so the gap is added to a clear line box', () => {
    const h1 = block('h1,\n.title-page');
    const size = Number(h1.match(/font-size:\s*(\d+)px/)?.[1]);
    const line = Number(h1.match(/line-height:\s*(\d+)px/)?.[1]);
    expect(line).toBeGreaterThan(size);
  });
});
