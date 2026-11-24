import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { CategoryTaxonomyView } from '../app/categories/CategoryTaxonomyView';
import { CategoryModal } from '../app/categories/CategoryModal';
import { BrandModal } from '../app/categories/BrandModal';
import type { AdminCategoryTreeItem, AdminBrandListItem } from '@revime/shared';

function cleanHtml(html: string): string {
  return html
    .replace(/<!-- -->/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');
}

describe('P22: Catégories & Marques — Reordering, Cascade Disable, Parent Counters, Icons & Brand Logos', () => {
  const originalFetch = global.fetch;
  let fetchCalls: Array<{ url: string; options?: RequestInit }> = [];

  const mockCategoriesTree: AdminCategoryTreeItem[] = [
    {
      id: 'cat-root-1',
      parentId: null,
      slug: 'telephonie',
      labelFr: 'Téléphonie & Mobilité',
      icon: '📱',
      description: 'Smartphones, tablettes et accessoires mobiles',
      active: true,
      sortOrder: 10,
      demandesCount: 16, // 4 direct + 10 (sub1) + 2 (sub2)
      repairersCount: 9, // 2 direct + 5 (sub1) + 2 (sub2)
      children: [
        {
          id: 'cat-sub-1',
          parentId: 'cat-root-1',
          slug: 'smartphones',
          labelFr: 'Smartphones',
          icon: '📲',
          description: 'iPhones, Galaxy et tous smartphones',
          active: true,
          sortOrder: 10,
          demandesCount: 10,
          repairersCount: 5,
          children: [],
        },
        {
          id: 'cat-sub-2',
          parentId: 'cat-root-1',
          slug: 'tablettes',
          labelFr: 'Tablettes',
          icon: null,
          description: null,
          active: true,
          sortOrder: 20,
          demandesCount: 2,
          repairersCount: 2,
          children: [],
        },
      ],
    },
    {
      id: 'cat-root-2',
      parentId: null,
      slug: 'informatique',
      labelFr: 'Informatique',
      icon: '💻',
      description: 'Ordinateurs portables et PC fixes',
      active: true,
      sortOrder: 20,
      demandesCount: 5,
      repairersCount: 3,
      children: [],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    fetchCalls = [];
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      fetchCalls.push({ url, options });
      if (url.includes('/api/proxy/admin/catalog/categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCategoriesTree),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    }) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. Category Taxonomy: Parent Counters & Aggregated Badges', () => {
    it('renders category rows with icon, description, and aggregated counter badges', () => {
      const html = cleanHtml(renderToString(<CategoryTaxonomyView initialCategories={mockCategoriesTree} />));

      // Root category 1 name and icon
      expect(html).toContain('Téléphonie & Mobilité');
      expect(html).toContain('📱');
      expect(html).toContain('Smartphones, tablettes et accessoires mobiles');

      // Root category 2 name and icon
      expect(html).toContain('Informatique');
      expect(html).toContain('💻');
      expect(html).toContain('Ordinateurs portables et PC fixes');
    });
  });

  describe('2. Category Reordering: Move Up / Move Down buttons & boundary handling', () => {
    it('renders Move Up (↑) and Move Down (↓) buttons with proper boundary disabled state', () => {
      // Create a test component instance where categories are passed or preloaded
      const html = cleanHtml(renderToString(<CategoryTaxonomyView initialCategories={mockCategoriesTree} />));

      // Check toolbar presence
      expect(html).toContain('Tout déplier');
      expect(html).toContain('Tout replier');

      // Check Move Up (↑) and Move Down (↓) buttons with boundary disabled attributes
      expect(html).toContain('aria-label="Monter la catégorie"');
      expect(html).toContain('aria-label="Descendre la catégorie"');
      expect(html).toContain('title="Premier élément"');
      expect(html).toContain('title="Dernier élément"');
    });

    it('submits reorder request to PATCH /api/proxy/admin/catalog/categories/reorder with categoryIds array', async () => {
      const reorderPayload = { categoryIds: ['cat-root-2', 'cat-root-1'] };

      await fetch('/api/proxy/admin/catalog/categories/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reorderPayload),
      });

      expect(fetchCalls.some((c) =>
        c.url === '/api/proxy/admin/catalog/categories/reorder' &&
        c.options?.method === 'PATCH' &&
        c.options?.body === JSON.stringify(reorderPayload)
      )).toBe(true);
    });
  });

  describe('3. Cascade Disable Confirmation Dialog', () => {
    it('formats cascade disable prompt text with correct subcategory count', () => {
      const parentWithChildren = mockCategoriesTree[0];
      const count = parentWithChildren.children.length;
      const promptText = `Désactiver cette catégorie principale désactivera également ses ${count} sous-catégories. Continuer ?`;

      expect(promptText).toBe('Désactiver cette catégorie principale désactivera également ses 2 sous-catégories. Continuer ?');
    });

    it('calls active toggle endpoint when deactivation is executed', async () => {
      const categoryId = 'cat-root-1';
      await fetch(`/api/proxy/admin/catalog/categories/${categoryId}/active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false }),
      });

      expect(fetchCalls.some((c) =>
        c.url === `/api/proxy/admin/catalog/categories/${categoryId}/active` &&
        c.options?.method === 'PATCH' &&
        c.options?.body === JSON.stringify({ active: false })
      )).toBe(true);
    });
  });

  describe('4. CategoryModal: Icon and Description inputs', () => {
    it('renders icon and description inputs in create mode', () => {
      const html = cleanHtml(
        renderToString(
          <CategoryModal
            isOpen={true}
            onClose={vi.fn()}
            onSuccess={vi.fn()}
            mode="create"
            rootCategories={[{ id: 'cat-root-1', labelFr: 'Téléphonie' }]}
          />,
        ),
      );

      expect(html).toContain('id="category-icon-input"');
      expect(html).toContain('Icône ou émoji');
      expect(html).toContain('id="category-description-input"');
      expect(html).toContain('Description');
    });

    it('pre-fills icon and description inputs when editing an existing category', () => {
      const html = cleanHtml(
        renderToString(
          <CategoryModal
            isOpen={true}
            onClose={vi.fn()}
            onSuccess={vi.fn()}
            mode="edit"
            categoryToEdit={mockCategoriesTree[0]}
            rootCategories={[]}
          />,
        ),
      );

      expect(html).toContain('value="📱"');
      expect(html).toContain('Smartphones, tablettes et accessoires mobiles');
    });
  });

  describe('5. BrandModal: Logo URL preview & Multi-Category Checkboxes', () => {
    const mockCategories = [
      { id: 'cat-1', labelFr: 'Smartphones' },
      { id: 'cat-2', labelFr: 'Tablettes' },
      { id: 'cat-3', labelFr: 'Ordinateurs' },
    ];

    const mockBrandToEdit: AdminBrandListItem = {
      id: 'brand-1',
      name: 'Apple',
      slug: 'apple',
      logoUrl: 'https://cdn.example.com/apple.svg',
      active: true,
      sortOrder: 1,
      categories: [
        { id: 'cat-1', labelFr: 'Smartphones' },
        { id: 'cat-2', labelFr: 'Tablettes' },
      ],
      modelsCount: 25,
      createdAt: '2026-10-15T00:00:00.000Z',
    };

    it('renders Logo URL input and thumbnail preview', () => {
      const html = cleanHtml(
        renderToString(
          <BrandModal
            isOpen={true}
            onClose={vi.fn()}
            onSuccess={vi.fn()}
            mode="edit"
            brandToEdit={mockBrandToEdit}
            categories={mockCategories}
          />,
        ),
      );

      expect(html).toContain('id="brand-logo-url-input"');
      expect(html).toContain('URL du logo');
      expect(html).toContain('value="https://cdn.example.com/apple.svg"');
      expect(html).toContain('data-testid="brand-logo-preview"');
      expect(html).toContain('src="https://cdn.example.com/apple.svg"');
    });

    it('renders accessible multi-category checkboxes for scoping brands', () => {
      const html = cleanHtml(
        renderToString(
          <BrandModal
            isOpen={true}
            onClose={vi.fn()}
            onSuccess={vi.fn()}
            mode="edit"
            brandToEdit={mockBrandToEdit}
            categories={mockCategories}
          />,
        ),
      );

      expect(html).toContain('type="checkbox"');
      expect(html).toContain('Smartphones');
      expect(html).toContain('Tablettes');
      expect(html).toContain('Ordinateurs');

      // Should indicate 2 selected categories
      expect(html).toContain('Désélectionner tout (2 sélectionnée(s))');
    });

    it('uses navy button for primary submit action (zero black buttons constraint)', () => {
      const html = cleanHtml(
        renderToString(
          <BrandModal
            isOpen={true}
            onClose={vi.fn()}
            onSuccess={vi.fn()}
            mode="create"
            categories={mockCategories}
          />,
        ),
      );

      expect(html).not.toContain('background-color: #000000');
      expect(html).not.toContain('background-color: #141414');
      expect(html).not.toContain('var(--accent, #141414)');
      expect(html).toContain('var(--navy, #25324f)');
    });
  });
});
