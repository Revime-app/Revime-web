'use client';

import { useState } from 'react';
import { hideReviewInputSchema, REVIEW_MODERATION_MOTIF_LABEL, type ReviewModerationMotif } from '@revime/shared';

/**
 * CF4-37 (spec L3, §4.4). « Masquer l'avis »: motif required from the fixed list (there is no
 * « negative » motif), note required for « Autre ». Validated with the shared schema first so
 * the operator reads the API's own French messages.
 */

const MOTIFS = Object.entries(REVIEW_MODERATION_MOTIF_LABEL) as [ReviewModerationMotif, string][];

export interface HideReviewModalProps {
  reviewId: string;
  onClose: () => void;
  onHidden: () => void;
}

export function HideReviewModal({ reviewId, onClose, onHidden }: HideReviewModalProps) {
  const [motif, setMotif] = useState<ReviewModerationMotif | ''>('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ motif?: string; note?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = hideReviewInputSchema.safeParse({ motif: motif || undefined, note });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === 'note' ? 'note' : 'motif';
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const res = await fetch(`/api/proxy/admin/reviews/${encodeURIComponent(reviewId)}/hide`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const fields = (data?.error?.fields ?? {}) as { motif?: string; note?: string };
        setErrors({ ...fields, form: fields.motif || fields.note ? undefined : data?.error?.message || "Impossible de masquer l'avis." });
        return;
      }
      onHidden();
    } catch {
      setErrors({ form: "Erreur réseau. Impossible de masquer l'avis." });
    } finally {
      setSaving(false);
    }
  }

  const errorText: React.CSSProperties = { color: 'var(--red-text, #bd0e26)', fontSize: 12, margin: '6px 0 0' };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hide-review-title"
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
        <h2 id="hide-review-title" style={{ fontSize: 18, margin: 0 }}>
          Masquer l&apos;avis
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--muted, #6b7280)' }}>
          Un avis ne peut pas être masqué parce qu&apos;il est négatif.
        </p>

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }} aria-invalid={errors.motif !== undefined}>
          <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Motif</legend>
          {MOTIFS.map(([value, text]) => (
            <label key={value} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, padding: '3px 0' }}>
              <input type="radio" name="motif" value={value} checked={motif === value} onChange={() => setMotif(value)} />
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
          <label htmlFor="hide-review-note" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Précision {motif === 'OTHER' ? '(obligatoire)' : '(facultatif)'}
          </label>
          <textarea
            id="hide-review-note"
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
            {saving ? 'Masquage…' : "Masquer l'avis"}
          </button>
        </div>
      </form>
    </div>
  );
}
