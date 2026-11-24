import { describe, it, expect } from 'vitest';
import { slugify } from '../app/categories/BrandModal';
import { BrandModelCatalogView } from '../app/categories/BrandModelCatalogView';
import { BrandModal } from '../app/categories/BrandModal';
import { ModelModal } from '../app/categories/ModelModal';
import {
  createBrandSchema,
  updateBrandSchema,
  createDeviceModelSchema,
  updateDeviceModelSchema,
} from '@revime/shared';

describe('Brand & Model catalog components and helpers', () => {
  describe('slugify helper', () => {
    it('normalizes French accented names into clean slugs', () => {
      expect(slugify('Téléphonie & Mobilité')).toBe('telephonie-mobilite');
      expect(slugify('Électroménager')).toBe('electromenager');
      expect(slugify('Cafetière Électrique')).toBe('cafetiere-electrique');
    });

    it('handles brand and model names with spaces, digits, and symbols', () => {
      expect(slugify('Apple')).toBe('apple');
      expect(slugify('iPhone 15 Pro Max')).toBe('iphone-15-pro-max');
      expect(slugify('Samsung Galaxy S24+')).toBe('samsung-galaxy-s24');
      expect(slugify('Dyson V15 Detect Absolute')).toBe('dyson-v15-detect-absolute');
    });

    it('trims leading, trailing and duplicate dashes', () => {
      expect(slugify('---hello---world---')).toBe('hello-world');
      expect(slugify('  special  brand   ')).toBe('special-brand');
    });
  });

  describe('Component exports', () => {
    it('exports BrandModelCatalogView, BrandModal, and ModelModal components', () => {
      expect(typeof BrandModelCatalogView).toBe('function');
      expect(typeof BrandModal).toBe('function');
      expect(typeof ModelModal).toBe('function');
    });
  });

  describe('Schema compatibility for brand and model payloads', () => {
    it('validates a create brand payload correctly', () => {
      const payload = {
        name: 'Apple',
        slug: slugify('Apple'),
        categoryIds: ['11111111-1111-4111-8111-111111111111'],
        sortOrder: 1,
      };
      const parsed = createBrandSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('validates an update brand payload correctly', () => {
      const payload = {
        name: 'Apple Inc',
        active: false,
        sortOrder: 2,
      };
      const parsed = updateBrandSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('validates a create device model payload correctly', () => {
      const payload = {
        brandId: '22222222-2222-4222-8222-222222222222',
        name: 'iPhone 15 Pro',
        slug: slugify('iPhone 15 Pro'),
        categoryId: null,
        sortOrder: 0,
      };
      const parsed = createDeviceModelSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('validates an update device model payload correctly', () => {
      const payload = {
        name: 'iPhone 15 Pro (Titanium)',
        active: true,
        sortOrder: 5,
        categoryId: '11111111-1111-4111-8111-111111111111',
      };
      const parsed = updateDeviceModelSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
    });
  });
});
