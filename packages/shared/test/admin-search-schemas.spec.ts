import { describe, expect, it } from 'vitest';
import {
  adminSearchResultItemSchema,
  adminSearchResultSchema,
  adminSearchCategorySchema,
  ADMIN_SEARCH_CATEGORY_LABELS,
  adminSearchDetailedItemSchema,
  adminSearchQuerySchema,
  adminSearchDetailedResponseSchema,
  type AdminSearchCategory,
  type AdminSearchResultItem,
  type AdminSearchResult,
  type AdminSearchDetailedItem,
  type AdminSearchQuery,
  type AdminSearchDetailedResponse,
} from '../src/index.js';

describe('Admin Search Schemas Contract', () => {
  describe('adminSearchResultItemSchema', () => {
    it('validates a complete search result item', () => {
      const item: AdminSearchResultItem = {
        id: 'cmd-12345',
        title: 'Commande #CMD-12345',
        subtitle: 'Client : Alice · Réparateur : Bob',
        badge: 'PAID',
        href: '/commandes/cmd-12345',
      };
      const parsed = adminSearchResultItemSchema.parse(item);
      expect(parsed).toEqual(item);
    });

    it('validates an item with minimal required fields', () => {
      const item = {
        id: 'usr-999',
        title: 'Jean Dupont',
        href: '/utilisateurs/usr-999',
      };
      const parsed = adminSearchResultItemSchema.parse(item);
      expect(parsed.id).toBe('usr-999');
      expect(parsed.subtitle).toBeUndefined();
      expect(parsed.badge).toBeUndefined();
    });

    it('rejects an item missing required fields', () => {
      expect(() => adminSearchResultItemSchema.parse({ id: '123' })).toThrow();
    });
  });

  describe('adminSearchResultSchema', () => {
    it('validates 4-category search results including demandes', () => {
      const result: AdminSearchResult = {
        commandes: [
          { id: 'c1', title: 'Commande 1', href: '/commandes/c1' },
        ],
        users: [
          { id: 'u1', title: 'User 1', href: '/utilisateurs/u1' },
        ],
        demandes: [
          { id: 'd1', title: 'Demande 1', href: '/demandes/d1' },
        ],
        disputes: [
          { id: 'disp1', title: 'Litige 1', href: '/litiges?disputeId=disp1' },
        ],
      };
      const parsed = adminSearchResultSchema.parse(result);
      expect(parsed.commandes).toHaveLength(1);
      expect(parsed.users).toHaveLength(1);
      expect(parsed.demandes).toHaveLength(1);
      expect(parsed.disputes).toHaveLength(1);
    });

    it('rejects search results missing the demandes array', () => {
      const incomplete = {
        commandes: [],
        users: [],
        disputes: [],
      };
      expect(() => adminSearchResultSchema.parse(incomplete)).toThrow();
    });
  });

  describe('adminSearchCategorySchema and labels', () => {
    const validCategories: AdminSearchCategory[] = [
      'all',
      'commandes',
      'users',
      'demandes',
      'disputes',
    ];

    it('validates all allowed category enums', () => {
      for (const cat of validCategories) {
        expect(adminSearchCategorySchema.parse(cat)).toBe(cat);
      }
    });

    it('rejects invalid categories', () => {
      expect(() => adminSearchCategorySchema.parse('invalid')).toThrow();
      expect(() => adminSearchCategorySchema.parse('commande')).toThrow();
    });

    it('has labels and icons for every category in ADMIN_SEARCH_CATEGORY_LABELS', () => {
      for (const cat of validCategories) {
        const entry = ADMIN_SEARCH_CATEGORY_LABELS[cat];
        expect(entry).toBeDefined();
        expect(typeof entry.label).toBe('string');
        expect(entry.label.length).toBeGreaterThan(0);
        expect(typeof entry.icon).toBe('string');
        expect(entry.icon.length).toBeGreaterThan(0);
      }
      expect(ADMIN_SEARCH_CATEGORY_LABELS.all.label).toBe('Tous les résultats');
      expect(ADMIN_SEARCH_CATEGORY_LABELS.commandes.label).toBe('Commandes');
      expect(ADMIN_SEARCH_CATEGORY_LABELS.users.label).toBe('Utilisateurs');
      expect(ADMIN_SEARCH_CATEGORY_LABELS.demandes.label).toBe('Demandes');
      expect(ADMIN_SEARCH_CATEGORY_LABELS.disputes.label).toBe('Litiges');
    });
  });

  describe('adminSearchDetailedItemSchema', () => {
    it('validates detailed item with category and optional fields', () => {
      const detailed: AdminSearchDetailedItem = {
        id: 'dem-777',
        title: 'Écran cassé iPhone 13',
        subtitle: 'Paris 11e · Smartphone',
        badge: 'OPEN',
        href: '/demandes/dem-777',
        category: 'demande',
        snippet: 'Besoin de remplacer vitre avant...',
        createdAt: '2026-10-16T12:00:00.000Z',
        metadata: { brand: 'Apple', model: 'iPhone 13' },
      };
      const parsed = adminSearchDetailedItemSchema.parse(detailed);
      expect(parsed.category).toBe('demande');
      expect(parsed.snippet).toBe('Besoin de remplacer vitre avant...');
      expect(parsed.createdAt).toBe('2026-10-16T12:00:00.000Z');
      expect(parsed.metadata).toEqual({ brand: 'Apple', model: 'iPhone 13' });
    });

    it('rejects invalid category on detailed item', () => {
      const item = {
        id: '1',
        title: 'Test',
        href: '/test/1',
        category: 'all', // 'all' is a query category, not an item category
      };
      expect(() => adminSearchDetailedItemSchema.parse(item)).toThrow();
    });

    it('rejects invalid createdAt format', () => {
      const item = {
        id: '1',
        title: 'Test',
        href: '/test/1',
        category: 'commande',
        createdAt: 'not-a-datetime',
      };
      expect(() => adminSearchDetailedItemSchema.parse(item)).toThrow();
    });
  });

  describe('adminSearchQuerySchema', () => {
    it('provides sensible defaults when empty input is passed', () => {
      const parsed: AdminSearchQuery = adminSearchQuerySchema.parse({});
      expect(parsed.q).toBe('');
      expect(parsed.category).toBe('all');
      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(20);
    });

    it('trims query string and truncates at 100 characters', () => {
      const longString = 'a'.repeat(150);
      const parsed = adminSearchQuerySchema.parse({
        q: `   ${longString}   `,
      });
      expect(parsed.q).toHaveLength(100);
      expect(parsed.q).toBe('a'.repeat(100));
    });

    it('coerces string numbers for page and limit', () => {
      const parsed = adminSearchQuerySchema.parse({
        page: '4',
        limit: '15',
        category: 'commandes',
      });
      expect(parsed.page).toBe(4);
      expect(parsed.limit).toBe(15);
      expect(parsed.category).toBe('commandes');
    });

    it('enforces min and max bounds for pagination', () => {
      expect(() => adminSearchQuerySchema.parse({ page: 0 })).toThrow();
      expect(() => adminSearchQuerySchema.parse({ limit: 0 })).toThrow();
      expect(() => adminSearchQuerySchema.parse({ limit: 51 })).toThrow();
      expect(adminSearchQuerySchema.parse({ limit: 50 }).limit).toBe(50);
    });
  });

  describe('adminSearchDetailedResponseSchema', () => {
    it('validates a complete paginated detailed response', () => {
      const response: AdminSearchDetailedResponse = {
        query: 'écran',
        category: 'all',
        total: 12,
        counts: {
          all: 12,
          commandes: 5,
          users: 1,
          demandes: 6,
          disputes: 0,
        },
        items: [
          {
            id: 'c1',
            title: 'Commande 1',
            href: '/commandes/c1',
            category: 'commande',
          },
        ],
        page: 1,
        limit: 20,
      };
      const parsed = adminSearchDetailedResponseSchema.parse(response);
      expect(parsed.total).toBe(12);
      expect(parsed.counts.demandes).toBe(6);
      expect(parsed.items).toHaveLength(1);
    });

    it('rejects negative counts or total', () => {
      const invalid = {
        query: 'test',
        category: 'all',
        total: -1,
        counts: {
          all: -1,
          commandes: 0,
          users: 0,
          demandes: 0,
          disputes: 0,
        },
        items: [],
        page: 1,
        limit: 20,
      };
      expect(() => adminSearchDetailedResponseSchema.parse(invalid)).toThrow();
    });

    it('rejects missing category counts', () => {
      const invalid = {
        query: 'test',
        category: 'all',
        total: 0,
        counts: {
          all: 0,
          commandes: 0,
          users: 0,
          // demandes missing
          disputes: 0,
        },
        items: [],
        page: 1,
        limit: 20,
      };
      expect(() => adminSearchDetailedResponseSchema.parse(invalid)).toThrow();
    });
  });
});
