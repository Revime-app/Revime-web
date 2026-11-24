import { REVIEW_MODERATION_MOTIF_LABEL, type ReviewModerationMotif } from '@revime/shared';

/** CF4-37 « Avis » (spec §4.4). Pure helpers - no React. */

export const DEMO_REVIEW_LABEL = 'DÉMO · AVIS FICTIF';

export function reviewStateLabel(r: { hidden: boolean; moderationMotif: ReviewModerationMotif | null }): string {
  if (!r.hidden) return 'Visible';
  // A row hidden before L carries no motif (spec §4.1: no backfill).
  return `Masqué · ${r.moderationMotif ? REVIEW_MODERATION_MOTIF_LABEL[r.moderationMotif] : 'motif non renseigné'}`;
}

export function demoPill(isDemo: boolean): string | null {
  return isDemo ? DEMO_REVIEW_LABEL : null;
}

/** One line for the table: whitespace collapsed, cut on a word boundary when possible. */
export function excerpt(comment: string | null, max: number): string {
  const flat = (comment ?? '').replace(/\s+/g, ' ').trim();
  if (flat === '') return 'Sans commentaire';
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
