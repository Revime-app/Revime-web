import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

import type { AdminBadgeCounts } from '@revime/shared';
import { AdminNav, AdminNavCategories, NAV_CATEGORIES, NavCategoryChevron } from '../components/AdminNav';

// ISS-128: the sidebar category headers opened and closed with a `▾` text glyph that CSS rotated
// when collapsed. They now show Lucide chevrons: up when the category is open, down when closed.
describe('ISS-128: sidebar category chevrons', () => {
  it('shows chevron-up while a category is open', () => {
    const html = renderToString(<NavCategoryChevron collapsed={false} />);
    expect(html).toContain('lucide-chevron-up');
    expect(html).not.toContain('lucide-chevron-down');
  });

  it('shows chevron-down while a category is closed', () => {
    const html = renderToString(<NavCategoryChevron collapsed />);
    expect(html).toContain('lucide-chevron-down');
    expect(html).not.toContain('lucide-chevron-up');
  });

  it('is decorative: the button already carries aria-expanded', () => {
    expect(renderToString(<NavCategoryChevron collapsed={false} />)).toContain('aria-hidden="true"');
  });

  it('draws one chevron per category in the sidebar, and no text glyph', () => {
    const html = renderToString(<AdminNav />);
    const open = (html.match(/lucide-chevron-up/g) ?? []).length;
    const closed = (html.match(/lucide-chevron-down/g) ?? []).length;
    expect(open + closed).toBe(NAV_CATEGORIES.length);
    expect(html).not.toContain('▾');
  });

  it('keeps the expanded state on the header button for assistive technology', () => {
    expect(renderToString(<AdminNav />)).toContain('aria-expanded="true"');
  });

  it('wires each header chevron to its own category open or closed state', () => {
    const [first, second] = NAV_CATEGORIES;
    const html = renderToString(
      <AdminNavCategories initialBadges={{} as AdminBadgeCounts} initialCollapsed={{ [second.id]: true }} />,
    );
    const headerOf = (id: string) => {
      const start = html.indexOf(`data-category="${id}"`);
      const end = html.indexOf('</button>', start);
      return html.slice(start, end);
    };
    expect(headerOf(first.id)).toContain('lucide-chevron-up');
    expect(headerOf(first.id)).toContain('aria-expanded="true"');
    expect(headerOf(second.id)).toContain('lucide-chevron-down');
    expect(headerOf(second.id)).not.toContain('lucide-chevron-up');
    expect(headerOf(second.id)).toContain('aria-expanded="false"');
  });
});
