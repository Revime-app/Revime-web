'use client';

import { useState } from 'react';
import { IDENTITY_DECISION_MOTIF_LABEL, type IdentityDecisionMotif } from '@revime/shared';
import { parseDecisionForm, type DecisionFormErrors } from '../../lib/identity-decision';

/**
 * CF4-39 (sub-project M, spec §4.6). « Refuser » / « Demander de nouveaux documents »: five motif
 * radios, note required for « Autre ». Same form for both (spec M4: same effect, different wording
 * for the réparateur). Validated with the shared schema first so the operator reads the API's own
 * French messages; server field errors land on their field, a CONFLICT goes back to the panel.
 */

const MOTIFS = Object.entries(IDENTITY_DECISION_MOTIF_LABEL) as [IdentityDecisionMotif, string][];

export type DecisionKind = 'refuse' | 'request';

const TITLE: Record<DecisionKind, string> = {
  refuse: "Refuser la vérification d'identité",
  request: 'Demander de nouveaux documents',
};
const SUBMIT: Record<DecisionKind, string> = {
  refuse: 'Refuser',
  request: 'Demander les documents',
};

export interface IdentityDecisionModalProps {
  userId: string;
  kind: DecisionKind;
  onClose: () => void;
  onDone: () => void;
  /** A CONFLICT: shown as the panel's banner, and the list is reloaded. */
  onConflict: (message: string) => void;
}

export function IdentityDecisionModal({ userId, kind, onClose, onDone, onConflict }: IdentityDecisionModalProps) {
  const [motif, setMotif] = useState<IdentityDecisionMotif | ''>('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<DecisionFormErrors & { form?: string }>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseDecisionForm(motif, note);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const body = JSON.stringify(parsed.data);
      const res =
        kind === 'refuse'
          ? await fetch(`/api/proxy/admin/users/${encodeURIComponent(userId)}/identity/refuse`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body,
            })
          : await fetch(`/api/proxy/admin/users/${encodeURIComponent(userId)}/identity/request-documents`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body,
            });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message: string = data?.error?.message || "Impossible d'enregistrer la décision.";
        if (res.status === 409) {
          onConflict(message);
          return;
        }
        const fields = (data?.error?.fields ?? {}) as DecisionFormErrors;
        setErrors({ ...fields, form: fields.motif || fields.note ? undefined : message });
        return;
      }
      onDone();
    } catch {
      setErrors({ form: "Erreur réseau. Impossible d'enregistrer la décision." });
    } finally {
      setSaving(false);
    }
  }

  const errorText: React.CSSProperties = { color: 'var(--red-text, #bd0e26)', fontSize: 12, margin: '6px 0 0' };
  const titleId = `identity-decision-${kind}-title`;
  const noteId = `identity-decision-${kind}-note`;

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
        style={{ backgroundColor: 'var(--paper, #fff)', borderRadius: 10, padding: 24, width: '100%', maxWidth: 480, display: 'grid', gap: 12 }}
      >
        <h2 id={titleId} style={{ fontSize: 18, margin: 0 }}>
          {TITLE[kind]}
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--muted, #6b7280)' }}>
          Consultez les documents dans le tableau de bord Stripe avant de décider.
        </p>

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }} aria-invalid={errors.motif !== undefined}>
          <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Motif</legend>
          {MOTIFS.map(([value, text]) => (
            <label key={value} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, padding: '3px 0' }}>
              <input type="radio" name={`motif-${kind}`} value={value} checked={motif === value} onChange={() => setMotif(value)} />
              {text}
            </label>
          ))}
          {errors.motif && (
            <p role="alert" style={errorText}>
              {errors.motif}
            </p>
          )}
        </fieldset>

        <div>
          <label htmlFor={noteId} style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Précision {motif === 'OTHER' ? '(obligatoire)' : '(facultatif)'}
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
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

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '8px 14px', fontSize: 14, borderRadius: 4, border: '1px solid var(--line, #dfe2e2)', backgroundColor: 'var(--paper, #fff)', color: 'var(--ink, #141414)', cursor: 'pointer' }}
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
              backgroundColor: 'var(--red-deep, #bd0e26)',
              color: '#fff',
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? 'Enregistrement…' : SUBMIT[kind]}
          </button>
        </div>
      </form>
    </div>
  );
}
