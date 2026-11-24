'use client';

import { useState } from 'react';
import { adminTipInputSchema, type AdminTipItem, type TipCategory } from '@revime/shared';
import { formDatesToInstants, instantsToFormDates, TIP_POOL_LABEL } from '../../lib/tip-format';
import { TipAppPreview } from '../../components/TipAppPreview';

/**
 * CF4-38 & P23 « Conseils du jour ». Formulaire d'édition avec saisie des URLs d'image
 * et lien d'action, combiné à l'aperçu mobile in-app en direct.
 */

const MAX = 280;
const POOLS: TipCategory[] = ['CLIENT', 'REPAIRER', 'ALL'];

const field: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 14,
  borderRadius: 'var(--r-field, 4px)',
  border: '1px solid var(--line, #dfe2e2)',
  fontFamily: 'var(--font-google-sans), Arial, sans-serif',
};
const label: React.CSSProperties = { display: 'block', fontSize: 12, marginBottom: 4, fontWeight: 500 };
const errorText: React.CSSProperties = { color: 'var(--red-text, #bd0e26)', fontSize: 12, margin: '4px 0 0' };

type FieldErrors = Partial<Record<'text' | 'category' | 'startsAt' | 'endsAt' | 'imageUrl' | 'linkUrl' | 'form', string>>;

export interface TipFormProps {
  /** Null = create. */
  tip: AdminTipItem | null;
  defaultCategory: TipCategory;
  onSaved: () => void;
  onCancel: () => void;
}

export function TipForm({ tip, defaultCategory, onSaved, onCancel }: TipFormProps) {
  const initialDates = instantsToFormDates(tip?.startsAt ?? null, tip?.endsAt ?? null);
  const [text, setText] = useState(tip?.text ?? '');
  const [category, setCategory] = useState<TipCategory>(tip?.category ?? defaultCategory);
  const [active, setActive] = useState(tip?.active ?? true);
  const [imageUrl, setImageUrl] = useState(tip?.imageUrl ?? '');
  const [linkUrl, setLinkUrl] = useState(tip?.linkUrl ?? '');
  const [start, setStart] = useState(initialDates.start);
  const [end, setEnd] = useState(initialDates.end);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      text,
      category,
      active,
      imageUrl: imageUrl.trim() || null,
      linkUrl: linkUrl.trim() || null,
      ...formDatesToInstants(start, end),
    };

    const parsed = adminTipInputSchema.safeParse(body);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form') as keyof FieldErrors;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      const res = tip
        ? await fetch(`/api/proxy/admin/tips/${encodeURIComponent(tip.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsed.data),
          })
        : await fetch('/api/proxy/admin/tips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsed.data),
          });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string; fields?: Record<string, string> };
        } | null;
        const fields = data?.error?.fields ?? {};
        setErrors({
          ...(fields as FieldErrors),
          ...(Object.keys(fields).length === 0 ? { form: data?.error?.message || "Impossible d'enregistrer le conseil." } : {}),
        });
        return;
      }
      onSaved();
    } catch {
      setErrors({ form: "Erreur réseau. Impossible d'enregistrer le conseil." });
    } finally {
      setSaving(false);
    }
  }

  const count = text.trim().length;

  return (
    <div
      data-testid="tip-form-container"
      style={{
        display: 'flex',
        gap: 24,
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        marginBottom: '1.5rem',
      }}
    >
      <form
        onSubmit={onSubmit}
        aria-label={tip ? 'Modifier le conseil' : 'Ajouter un conseil'}
        style={{
          flex: '1 1 500px',
          display: 'grid',
          gap: 12,
          backgroundColor: 'var(--paper, #ffffff)',
          padding: 16,
          borderRadius: 'var(--r-card, 10px)',
          border: '1px solid var(--line, #dfe2e2)',
          maxWidth: 720,
        }}
      >
        <h2 style={{ fontSize: 16, margin: 0, color: 'var(--navy-text, #25324f)' }}>
          {tip ? 'Modifier le conseil' : 'Ajouter un conseil'}
        </h2>

        <div>
          <label htmlFor="tip-text" style={label}>
            Texte du conseil
          </label>
          <textarea
            id="tip-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            aria-invalid={errors.text !== undefined}
            aria-describedby="tip-text-count"
            style={{ ...field, width: '100%', resize: 'vertical' }}
          />
          <p
            id="tip-text-count"
            style={{ fontSize: 12, margin: '4px 0 0', color: count > MAX ? 'var(--red-text, #bd0e26)' : 'var(--muted, #6b7280)' }}
          >
            {count}/{MAX}
          </p>
          {errors.text && (
            <p role="alert" style={errorText}>
              {errors.text}
            </p>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <div>
            <label htmlFor="tip-image-url" style={label}>
              Image d&apos;illustration (URL)
            </label>
            <input
              id="tip-image-url"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://images.example.com/photo.jpg"
              style={{ ...field, width: '100%' }}
            />
            {errors.imageUrl && (
              <p role="alert" style={errorText}>
                {errors.imageUrl}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="tip-link-url" style={label}>
              Lien d&apos;action (URL)
            </label>
            <input
              id="tip-link-url"
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://revime.fr/guides/batterie"
              style={{ ...field, width: '100%' }}
            />
            {errors.linkUrl && (
              <p role="alert" style={errorText}>
                {errors.linkUrl}
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <label htmlFor="tip-category" style={label}>
              Destinataires
            </label>
            <select
              id="tip-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as TipCategory)}
              style={{ ...field, backgroundColor: 'var(--paper)' }}
            >
              {POOLS.map((p) => (
                <option key={p} value={p}>
                  {TIP_POOL_LABEL[p]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="tip-start" style={label}>
              Du (facultatif)
            </label>
            <input id="tip-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} style={field} />
            {errors.startsAt && (
              <p role="alert" style={errorText}>
                {errors.startsAt}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="tip-end" style={label}>
              Au (facultatif, inclus)
            </label>
            <input
              id="tip-end"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              aria-invalid={errors.endsAt !== undefined}
              style={field}
            />
            {errors.endsAt && (
              <p role="alert" style={errorText}>
                {errors.endsAt}
              </p>
            )}
          </div>

          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14, paddingBottom: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Actif
          </label>
        </div>

        {errors.form && (
          <p role="alert" style={errorText}>
            {errors.form}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 'var(--r-field, 4px)',
              border: '1px solid var(--line, #dfe2e2)',
              backgroundColor: 'var(--navy, #25324f)',
              color: '#ffffff',
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              ...field,
              backgroundColor: 'var(--paper)',
              color: 'var(--navy-text, #25324f)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Annuler
          </button>
        </div>
      </form>

      {/* Real-time In-App Preview */}
      <div style={{ flex: '0 0 auto' }}>
        <TipAppPreview
          text={text}
          imageUrl={imageUrl}
          linkUrl={linkUrl}
        />
      </div>
    </div>
  );
}
