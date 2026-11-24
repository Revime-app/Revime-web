import { DEMANDE_DESCRIPTION_MIN, DEMANDE_TITLE_MIN } from '@revime/shared';

/** What the publish wizard's Continuer gate reads, step by step. */
export type WizardFields = {
  categoryId: string;
  title: string;
  /** A photo still uploading would publish without its path. */
  photosUploading: boolean;
  description: string;
  postalCode: string;
  locationLabel: string;
  mode: 'OFFERS' | 'BUDGET';
  budget: string;
};

/**
 * Whether « Continuer » may leave `step`. Pure, so it is tested without the screen.
 *
 * 🛑 V7 `FND7-074`: the minimums come from `@revime/shared`, the same constants the server schema
 * and the « Au moins N caractères » hints use. They used to be written here as 5 and 20, three
 * rounds after `CF3-08` lowered the schema to 2 and 10, so the hint promised 2 and the button
 * refused anything under 5. Spaces do not count (`trim`), matching what `submit` sends.
 */
export function canContinueStep(step: number, f: WizardFields): boolean {
  switch (step) {
    case 1:
      return Boolean(f.categoryId) && f.title.trim().length >= DEMANDE_TITLE_MIN && !f.photosUploading;
    case 2:
      return f.description.trim().length >= DEMANDE_DESCRIPTION_MIN;
    case 3:
      return (
        f.postalCode.trim().length === 5 &&
        f.locationLabel.trim().length >= 2 &&
        (f.mode === 'OFFERS' || Number(f.budget) > 0)
      );
    default:
      return true;
  }
}
