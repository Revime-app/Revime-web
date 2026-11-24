import { describe, expect, it } from 'vitest';
import { DEMANDE_FIELD_CLASS, demandeEditPolicy } from '@revime/shared';

describe('demandeEditPolicy', () => {
  it('allows everything on an OPEN demande with no offers', () => {
    expect(demandeEditPolicy('OPEN', 0)).toEqual({
      canEdit: true,
      contractLocked: false,
      canDelete: true,
    });
  });

  it('locks contract fields once one live offer exists, but still allows editing', () => {
    expect(demandeEditPolicy('OPEN', 1)).toEqual({
      canEdit: true,
      contractLocked: true,
      canDelete: true,
    });
  });

  /** Money is in. The refund path owns cancellation from here. */
  it('forbids edit and delete once IN_PROGRESS', () => {
    expect(demandeEditPolicy('IN_PROGRESS', 3)).toEqual({
      canEdit: false,
      contractLocked: false,
      canDelete: false,
    });
  });

  /**
   * A cancelled demande carries a refunded commande. Hiding it from the client's own list
   * would hide a money-trail record. Spec §1.2.
   */
  it('forbids edit and delete once CANCELLED', () => {
    expect(demandeEditPolicy('CANCELLED', 0)).toEqual({
      canEdit: false,
      contractLocked: false,
      canDelete: false,
    });
  });

  it('classifies all fields correctly', () => {
    // Descriptive
    expect(DEMANDE_FIELD_CLASS.title).toBe('descriptive');
    expect(DEMANDE_FIELD_CLASS.description).toBe('descriptive');
    expect(DEMANDE_FIELD_CLASS.brand).toBe('descriptive');
    expect(DEMANDE_FIELD_CLASS.model).toBe('descriptive');
    expect(DEMANDE_FIELD_CLASS.parts).toBe('descriptive');
    expect(DEMANDE_FIELD_CLASS.photoPaths).toBe('descriptive');

    // Contract
    expect(DEMANDE_FIELD_CLASS.categoryId).toBe('contract');
    expect(DEMANDE_FIELD_CLASS.mode).toBe('contract');
    expect(DEMANDE_FIELD_CLASS.budgetCents).toBe('contract');
    expect(DEMANDE_FIELD_CLASS.locationLabel).toBe('contract');
    expect(DEMANDE_FIELD_CLASS.postalCode).toBe('contract');
  });
});
