import { describe, it, expect } from 'vitest';
import {
  faultTypeDtoSchema,
  createFaultTypeSchema,
  updateFaultTypeSchema,
  reorderFaultTypesSchema,
  adminCatalogOverviewDtoSchema,
  adminDemandeDetailDtoSchema,
  adminAuditActionSchema,
  ADMIN_AUDIT_ACTION_LABEL,
  type FaultTypeDto,
  type CreateFaultTypeInput,
  type UpdateFaultTypeInput,
  type ReorderFaultTypesInput,
  type AdminCatalogOverviewDto,
  type AdminDemandeDetailDto,
} from '../src/index.js';

describe('Fault Types Schemas & Contracts (@revime/shared)', () => {
  const validUuid1 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const validUuid2 = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

  describe('faultTypeDtoSchema', () => {
    it('validates a complete fault type DTO', () => {
      const input: FaultTypeDto = {
        id: validUuid1,
        categoryId: validUuid2,
        categoryLabelFr: 'Smartphones & Tablettes',
        categorySlug: 'smartphones-tablettes',
        slug: 'ecran-casse',
        labelFr: 'Écran cassé ou fissuré',
        description: 'Vitre brisée, tactile inopérant ou écran noir.',
        icon: 'smartphone',
        sortOrder: 1,
        active: true,
        demandesCount: 14,
        createdAt: '2026-10-16T12:00:00.000Z',
        updatedAt: '2026-10-16T12:30:00.000Z',
      };

      const result = faultTypeDtoSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.slug).toBe('ecran-casse');
        expect(result.data.demandesCount).toBe(14);
      }
    });

    it('validates minimal fault type DTO with optional and nullable fields', () => {
      const input = {
        id: validUuid1,
        categoryId: validUuid2,
        slug: 'batterie-hs',
        labelFr: 'Batterie défaillante',
        description: null,
        icon: null,
        sortOrder: 0,
        active: false,
        createdAt: '2026-10-16T12:00:00.000Z',
        updatedAt: '2026-10-16T12:00:00.000Z',
      };

      const result = faultTypeDtoSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects invalid uuid in id or categoryId', () => {
      const badId = {
        id: 'not-a-uuid',
        categoryId: validUuid2,
        slug: 'ecran-casse',
        labelFr: 'Écran cassé',
        sortOrder: 0,
        active: true,
        createdAt: '2026-10-16T12:00:00.000Z',
        updatedAt: '2026-10-16T12:00:00.000Z',
      };
      expect(faultTypeDtoSchema.safeParse(badId).success).toBe(false);

      const badCategory = {
        ...badId,
        id: validUuid1,
        categoryId: 'not-a-uuid',
      };
      expect(faultTypeDtoSchema.safeParse(badCategory).success).toBe(false);
    });

    it('rejects empty labelFr or empty slug', () => {
      const emptyLabel = {
        id: validUuid1,
        categoryId: validUuid2,
        slug: 'slug-valide',
        labelFr: '',
        sortOrder: 0,
        active: true,
        createdAt: '2026-10-16T12:00:00.000Z',
        updatedAt: '2026-10-16T12:00:00.000Z',
      };
      expect(faultTypeDtoSchema.safeParse(emptyLabel).success).toBe(false);

      const emptySlug = {
        ...emptyLabel,
        labelFr: 'Label valide',
        slug: '',
      };
      expect(faultTypeDtoSchema.safeParse(emptySlug).success).toBe(false);
    });
  });

  describe('createFaultTypeSchema', () => {
    it('applies defaults for sortOrder and active when omitted', () => {
      const input: CreateFaultTypeInput = {
        categoryId: validUuid1,
        labelFr: 'Connecteur de charge abîmé',
      };

      const parsed = createFaultTypeSchema.parse(input);
      expect(parsed.categoryId).toBe(validUuid1);
      expect(parsed.labelFr).toBe('Connecteur de charge abîmé');
      expect(parsed.sortOrder).toBe(0);
      expect(parsed.active).toBe(true);
    });

    it('validates full create payload', () => {
      const input: CreateFaultTypeInput = {
        categoryId: validUuid1,
        labelFr: 'Bouton Power bloqué',
        slug: 'bouton-power-bloque',
        description: 'Le bouton power ne clique plus.',
        icon: 'power',
        sortOrder: 5,
        active: false,
      };

      const parsed = createFaultTypeSchema.parse(input);
      expect(parsed.slug).toBe('bouton-power-bloque');
      expect(parsed.sortOrder).toBe(5);
      expect(parsed.active).toBe(false);
    });

    it('rejects labelFr shorter than 2 characters with custom error message', () => {
      const result = createFaultTypeSchema.safeParse({
        categoryId: validUuid1,
        labelFr: 'A',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues.find((issue) => issue.path.includes('labelFr'));
        expect(error?.message).toBe('Le libellé doit comporter au moins 2 caractères');
      }
    });

    it('rejects labelFr longer than 100 characters', () => {
      const result = createFaultTypeSchema.safeParse({
        categoryId: validUuid1,
        labelFr: 'A'.repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative sortOrder', () => {
      const result = createFaultTypeSchema.safeParse({
        categoryId: validUuid1,
        labelFr: 'Caméra arrière floue',
        sortOrder: -1,
      });
      expect(result.success).toBe(false);
    });

    it('rejects description longer than 500 characters', () => {
      const result = createFaultTypeSchema.safeParse({
        categoryId: validUuid1,
        labelFr: 'Caméra arrière floue',
        description: 'D'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('rejects icon longer than 50 characters', () => {
      const result = createFaultTypeSchema.safeParse({
        categoryId: validUuid1,
        labelFr: 'Caméra arrière floue',
        icon: 'I'.repeat(51),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateFaultTypeSchema', () => {
    it('validates partial update payloads', () => {
      const input1: UpdateFaultTypeInput = {
        labelFr: 'Nouvel intitulé',
      };
      expect(updateFaultTypeSchema.parse(input1)).toEqual(input1);

      const input2: UpdateFaultTypeInput = {
        sortOrder: 10,
        active: false,
      };
      expect(updateFaultTypeSchema.parse(input2)).toEqual(input2);

      const input3: UpdateFaultTypeInput = {
        description: null,
        icon: null,
      };
      expect(updateFaultTypeSchema.parse(input3)).toEqual(input3);
    });

    it('accepts empty object', () => {
      expect(updateFaultTypeSchema.safeParse({}).success).toBe(true);
    });

    it('rejects labelFr shorter than 2 chars on update', () => {
      const result = updateFaultTypeSchema.safeParse({ labelFr: 'Z' });
      expect(result.success).toBe(false);
    });

    it('rejects negative sortOrder on update', () => {
      const result = updateFaultTypeSchema.safeParse({ sortOrder: -2 });
      expect(result.success).toBe(false);
    });
  });

  describe('reorderFaultTypesSchema', () => {
    it('validates reordering payload with non-empty uuid list', () => {
      const input: ReorderFaultTypesInput = {
        categoryId: validUuid1,
        orderedIds: [validUuid1, validUuid2],
      };
      const result = reorderFaultTypesSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.orderedIds).toHaveLength(2);
      }
    });

    it('rejects empty orderedIds array', () => {
      const result = reorderFaultTypesSchema.safeParse({
        categoryId: validUuid1,
        orderedIds: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid uuid in orderedIds', () => {
      const result = reorderFaultTypesSchema.safeParse({
        categoryId: validUuid1,
        orderedIds: ['invalid-uuid'],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('adminCatalogOverviewDtoSchema', () => {
    it('validates catalog overview including totalFaultTypes', () => {
      const input: AdminCatalogOverviewDto = {
        totalRootCategories: 5,
        totalSubCategories: 24,
        totalBrands: 12,
        totalModels: 45,
        totalFaultTypes: 88,
      };
      const parsed = adminCatalogOverviewDtoSchema.parse(input);
      expect(parsed.totalFaultTypes).toBe(88);
      expect(parsed.totalRootCategories).toBe(5);
    });

    it('rejects if totalFaultTypes is missing or not an integer', () => {
      const missing = {
        totalRootCategories: 5,
        totalSubCategories: 24,
        totalBrands: 12,
        totalModels: 45,
      };
      expect(adminCatalogOverviewDtoSchema.safeParse(missing).success).toBe(false);

      const floatValue = {
        ...missing,
        totalFaultTypes: 88.5,
      };
      expect(adminCatalogOverviewDtoSchema.safeParse(floatValue).success).toBe(false);
    });
  });

  describe('adminDemandeDetailDtoSchema & faultType attachment', () => {
    it('validates demande detail with attached faultType object', () => {
      const input = {
        demandeId: validUuid1,
        faultType: {
          id: validUuid2,
          labelFr: 'Écran tactile fissuré',
          slug: 'ecran-tactile-fissure',
        },
      };

      const result = adminDemandeDetailDtoSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.faultType?.labelFr).toBe('Écran tactile fissuré');
      }
    });

    it('validates demande detail with null or omitted faultType', () => {
      expect(
        adminDemandeDetailDtoSchema.safeParse({
          demandeId: validUuid1,
          faultType: null,
        }).success,
      ).toBe(true);

      expect(
        adminDemandeDetailDtoSchema.safeParse({
          demandeId: validUuid1,
        }).success,
      ).toBe(true);
    });

    it('rejects invalid uuid in faultType.id', () => {
      const input = {
        demandeId: validUuid1,
        faultType: {
          id: 'invalid-uuid',
          labelFr: 'Écran tactile fissuré',
          slug: 'ecran-tactile-fissure',
        },
      };
      expect(adminDemandeDetailDtoSchema.safeParse(input).success).toBe(false);
    });
  });

  describe('Audit action constants', () => {
    it('accepts all 4 fault_type audit action strings in adminAuditActionSchema', () => {
      expect(adminAuditActionSchema.parse('fault_type.create')).toBe('fault_type.create');
      expect(adminAuditActionSchema.parse('fault_type.update')).toBe('fault_type.update');
      expect(adminAuditActionSchema.parse('fault_type.delete')).toBe('fault_type.delete');
      expect(adminAuditActionSchema.parse('fault_type.reorder')).toBe('fault_type.reorder');
    });

    it('maps French human-readable labels in ADMIN_AUDIT_ACTION_LABEL', () => {
      expect(ADMIN_AUDIT_ACTION_LABEL['fault_type.create']).toBe("Création d'un type de panne");
      expect(ADMIN_AUDIT_ACTION_LABEL['fault_type.update']).toBe("Modification d'un type de panne");
      expect(ADMIN_AUDIT_ACTION_LABEL['fault_type.delete']).toBe("Suppression d'un type de panne");
      expect(ADMIN_AUDIT_ACTION_LABEL['fault_type.reorder']).toBe("Réordonnancement des types de panne");
    });
  });
});
