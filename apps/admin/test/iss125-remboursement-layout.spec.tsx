import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/remboursement',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('../components/AdminGate', () => ({
  useAdminMe: () => ({ role: 'super_admin', permissions: [] }),
}));

import RemboursementPage from '../app/remboursement/page';

// ISS-125: on /remboursement the order-id field sat at the right of a tall empty card and the
// « Rechercher » button at its bottom corner. globals.css gives EVERY form `flex-direction: column`
// (a login-page default); this form set `display:flex; align-items:flex-end; flex-wrap:wrap`
// inline, meaning a row, but never its direction. In a column `align-items:flex-end` pushes the
// children right and the input's `flex: 1 1 320px` becomes a 320px-tall box.
describe('ISS-125: /remboursement search card', () => {
  const html = renderToString(<RemboursementPage />);
  const form = html.match(/<form[^>]*>/)?.[0] ?? '';

  it('renders the search form', () => {
    expect(form).not.toBe('');
  });

  it('lays the search form out as a row, so the field grows and the button sits beside it', () => {
    expect(form).toContain('display:flex');
    expect(form).toContain('flex-direction:row');
  });

  it('uses the full-width page wrapper like /remboursements and /paiements', () => {
    expect(html).toContain('class="page page--wide"');
  });
});

describe('ISS-125: a form that sets display:flex inline also sets its direction', () => {
  const ROOT = path.resolve(__dirname, '..');
  const walk = (d: string, o: string[] = []): string[] => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, o);
      else if (/\.tsx$/.test(e.name)) o.push(p);
    }
    return o;
  };

  it('has no <form> relying on the global column default while setting display:flex', () => {
    const offenders: string[] = [];
    for (const f of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))]) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/<form\b/g)) {
        // The opening tag ends at the first `>` outside a `{...}` expression (a style object).
        let depth = 0;
        let end = m.index!;
        for (; end < src.length; end++) {
          const c = src[end];
          if (c === '{') depth++;
          else if (c === '}') depth--;
          else if (c === '>' && depth === 0) break;
        }
        const tag = src.slice(m.index!, end);
        if (/display:\s*['"]flex['"]/.test(tag) && !/flexDirection/.test(tag)) {
          offenders.push(`${path.relative(ROOT, f)}:${src.slice(0, m.index).split('\n').length}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
