'use client';

import { useState } from 'react';
import { BUSINESS_DECISION_MOTIF_LABEL, type BusinessDecisionMotif } from '@revime/shared';
import { parseBusinessDecisionForm, type BusinessDecisionFormErrors } from '../../lib/business-decision';

/**
 * CF5-07: Business verification refusal / document request modal.
 * Offers motif radio options and a note textarea (mandatory for "OTHER", optional otherwise).
 */

const MOTIFS = Object.entries(BUSINESS_DECISION_MOTIF_LABEL) as [BusinessDecisionMotif, string][];

export type BusinessDecisionKind = 'refuse' | 'request';

const TITLE: Record<BusinessDecisionKind, string> = {
  refuse: "Refuser la vérification d'entreprise",
  request: 'Demander de nouveaux documents',
};

const SUBMIT_LABEL: Record<BusinessDecisionKind, string> = {
  refuse: "Refuser l'entreprise",
  request: 'Demander les documents',
};

export interface BusinessDecisionModalProps {
  userId: string;
  kind: BusinessDecisionKind;
  onClose: () => void;
  onDone: () => void;
  /** A CONFLICT: shown as the panel's banner, and the list is reloaded. */
  onConflict: (message: string) => void;
}

export async function sendBusinessDecisionRequest(
  userId: string,
  kind: BusinessDecisionKind,
  payload: { motif: string; note?: string },
): Promise<{ ok: true } | { ok: false; status?: number; error?: string; fields?: BusinessDecisionFormErrors }> {
  try {
    const endpoint =
      kind === 'refuse'
        ? `/api/proxy/admin/verifications/business/${encodeURIComponent(userId)}/refuse`
        : `/api/proxy/admin/verifications/business/${encodeURIComponent(userId)}/request-documents`;

    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return {
        ok: false,
        status: res.status,
        error: data?.error?.message || "Impossible d'enregistrer la décision.",
        fields: data?.error?.fields,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Erreur réseau. Impossible d'enregistrer la décision." };
  }
}

export function BusinessDecisionModal({
  userId,
  kind,
  onClose,
  onDone,
  onConflict,
}: BusinessDecisionModalProps) {
  const [motif, setMotif] = useState<BusinessDecisionMotif | ''>('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<BusinessDecisionFormErrors & { form?: string }>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseBusinessDecisionForm(motif, note);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const res = await sendBusinessDecisionRequest(userId, kind, parsed.data);
      if (!res.ok) {
        if (res.status === 409) {
          onConflict(res.error || 'Cette vérification a déjà été traitée.');
          return;
        }
        const fields = res.fields ?? {};
        setErrors({ ...fields, form: fields.motif || fields.note ? undefined : res.error });
        return;
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  const errorText: React.CSSProperties = {
    color: 'var(--red-text, #bd0e26)',
    fontSize: 12,
    margin: '6px 0 0',
  };
  const titleId = `business-decision-${kind}-title`;
  const noteId = `business-decision-${kind}-note`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.45)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <form
        onSubmit={submit}
        style={{
          backgroundColor: 'var(--paper, #fff)',
          borderRadius: 10,
          padding: 24,
          width: '100%',
          maxWidth: 500,
          display: 'grid',
          gap: 14,
        }}
      >
        <h2 id={titleId} style={{ fontSize: 18, margin: 0 }}>
          {TITLE[kind]}
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--muted, #6b7280)' }}>
          {kind === 'refuse'
            ? "Indiquez le motif de refus de l'entreprise. Un e-mail explicatif sera envoyé au réparateur."
            : 'Indiquez les pièces ou corrections attendues. Le réparateur pourra soumettre un nouveau dossier.'}
        </p>

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }} aria-invalid={errors.motif !== undefined}>
          <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Motif</legend>
          {MOTIFS.map(([value, text]) => (
            <label
              key={value}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                fontSize: 14,
                padding: '4px 0',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name={`motif-${kind}`}
                value={value}
                checked={motif === value}
                onChange={() => setMotif(value)}
                style={{ marginTop: 3 }}
              />
              <span>{text}</span>
            </label>
          ))}
          {errors.motif && (
            <p role="alert" style={errorText}>
              {errors.motif}
            </p>
          )}
        </fieldset>

        <div>
          <label
            htmlFor={noteId}
            style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
          >
            Précision {motif === 'OTHER' ? '(obligatoire)' : '(facultatif)'}
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={
              motif === 'OTHER'
                ? 'Précisez la raison détaillée du refus ou de la demande...'
                : 'Commentaire ou consigne additionnelle pour le réparateur...'
            }
            aria-invalid={errors.note !== undefined}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 14,
              fontFamily: 'inherit',
              borderRadius: 4,
              border: '1px solid var(--line, #dfe2e2)',
            }}
          />
          {errors.note && (
            <p role="alert" style={errorText}>
              {errors.note}
            </p>
          )}
        </div>

        {errors.form && (
          <p role="alert" style={errorText}>
            {errors.form}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 14px',
              fontSize: 14,
              borderRadius: 4,
              border: '1px solid var(--line, #dfe2e2)',
              backgroundColor: 'var(--paper, #fff)',
              color: 'var(--ink, #141414)',
              cursor: 'pointer',
            }}
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '8px 14px',
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 4,
              border: 'none',
              backgroundColor: kind === 'refuse' ? 'var(--red-deep, #bd0e26)' : 'var(--navy)',
              color: '#fff',
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? 'Enregistrement…' : SUBMIT_LABEL[kind]}
          </button>
        </div>
      </form>
    </div>
  );
}
