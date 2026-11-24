import {
  BUSINESS_DECISION_MOTIF_LABEL,
  businessDecisionSchema,
  type AdminBusinessDetailsResponse,
  type BusinessDecisionInput,
  type BusinessDecisionMotif,
  type BusinessVerificationStatus,
} from '@revime/shared';

/** Pure helpers of the business decision panel & modal - no React. */

export type AllowedBusinessActions = { approve: boolean; refuse: boolean; request: boolean };

/**
 * Calculates which decision actions are permissible based on current verification status.
 */
export function allowedBusinessActions(
  status: BusinessVerificationStatus | null | undefined,
): AllowedBusinessActions {
  return {
    approve: status !== 'APPROVED',
    refuse: status !== 'REJECTED',
    request: status !== 'DOCUMENTS_REQUIRED',
  };
}

export type IdentityComparisonResult = {
  status: 'MATCH' | 'MISMATCH' | 'UNVERIFIED' | 'MISSING';
  label: string;
  tone: 'success' | 'danger' | 'warning' | 'neutral';
};

/**
 * Normalises and compares the declared legal representative with the Stripe-verified name.
 */
export function compareDirigeantWithIdentity(
  dirigeantName: string | null | undefined,
  verifiedIdentityName: string | null | undefined,
): IdentityComparisonResult {
  if (!verifiedIdentityName || verifiedIdentityName.trim() === '') {
    return {
      status: 'UNVERIFIED',
      label: 'Identité non vérifiée',
      tone: 'warning',
    };
  }
  if (!dirigeantName || dirigeantName.trim() === '') {
    return {
      status: 'MISSING',
      label: 'Non renseigné',
      tone: 'neutral',
    };
  }

  const normalize = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');

  if (normalize(dirigeantName) === normalize(verifiedIdentityName)) {
    return {
      status: 'MATCH',
      label: 'Identique',
      tone: 'success',
    };
  }

  return {
    status: 'MISMATCH',
    label: 'Différent',
    tone: 'danger',
  };
}

/**
 * Converts a byte count into a human-readable French format (e.g. 124 Ko, 2.5 Mo).
 */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 o';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) {
    const ko = bytes / 1024;
    return `${Number(ko.toFixed(1))} Ko`;
  }
  const mo = bytes / (1024 * 1024);
  return `${Number(mo.toFixed(1))} Mo`;
}

const dayFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});

/**
 * Formats prior decision history into a single display string.
 */
export function businessDecisionLine(d: AdminBusinessDetailsResponse['decision']): string | null {
  if (!d || !d.motif) return null;

  const label = BUSINESS_DECISION_MOTIF_LABEL[d.motif] ?? d.motif;
  const detail =
    d.motif === 'OTHER' && d.note
      ? `Autre motif : ${d.note}`
      : d.note
        ? `${label} (${d.note})`
        : label;

  const when = d.decidedAt ? dayFormatter.format(new Date(d.decidedAt)) : null;
  const author = d.decidedByEmail ? `par ${d.decidedByEmail}` : null;
  const dated = when && author ? `${when} ${author}` : when;

  return [detail, dated].filter(Boolean).join(' · ');
}

export type BusinessDecisionFormErrors = { motif?: string; note?: string };

/**
 * Validates the refuse / request-documents form using businessDecisionSchema.
 */
export function parseBusinessDecisionForm(
  motif: string,
  note: string,
): { ok: true; data: BusinessDecisionInput } | { ok: false; errors: BusinessDecisionFormErrors } {
  if (!motif) {
    return { ok: false, errors: { motif: 'Choisissez un motif.' } };
  }

  if (motif === 'OTHER' && (!note || note.trim().length === 0)) {
    return { ok: false, errors: { note: 'Précisez le motif pour la valeur Autre.' } };
  }

  if (note && note.trim().length > 500) {
    return { ok: false, errors: { note: '500 caractères maximum.' } };
  }

  const parsed = businessDecisionSchema.safeParse({
    motif: (motif || undefined) as BusinessDecisionMotif,
    note: note ? note.trim() : undefined,
  });

  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }

  const errors: BusinessDecisionFormErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] === 'note' ? 'note' : 'motif';
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}
