'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  AdminDeviceModelListItem,
  CreateDeviceModelInput,
  UpdateDeviceModelInput,
} from '@revime/shared';
import { slugify } from './BrandModal';

export interface ModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode: 'create' | 'edit';
  modelToEdit?: AdminDeviceModelListItem | null;
  initialBrandId?: string | null;
  brands: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; labelFr: string }>;
}

export function ModelModal({
  isOpen,
  onClose,
  onSuccess,
  mode,
  modelToEdit,
  initialBrandId,
  brands,
  categories,
}: ModelModalProps) {
  const [brandId, setBrandId] = useState<string>('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [active, setActive] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && modelToEdit) {
        setBrandId(modelToEdit.brandId);
        setName(modelToEdit.name);
        setSlug(modelToEdit.slug);
        setCategoryId(modelToEdit.categoryId ?? '');
        setSortOrder(modelToEdit.sortOrder ?? 0);
        setActive(modelToEdit.active ?? true);
      } else {
        const defaultBrandId = initialBrandId || (brands.length > 0 ? brands[0].id : '');
        setBrandId(defaultBrandId);
        setName('');
        setSlug('');
        setCategoryId('');
        setSortOrder(0);
        setActive(true);
      }
      setError(null);
      setIsSubmitting(false);

      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, mode, modelToEdit, initialBrandId, brands]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const isNameValid = name.trim().length >= 2;
  const isBrandValid = Boolean(brandId.trim());
  const canSubmit = isNameValid && (mode === 'edit' || isBrandValid) && !isSubmitting;
  const autoSlugPreview = slug.trim() || slugify(name);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    try {
      if (mode === 'create') {
        const payload: CreateDeviceModelInput = {
          brandId: brandId.trim(),
          name: name.trim(),
          sortOrder: Number(sortOrder) || 0,
          categoryId: categoryId.trim() ? categoryId.trim() : null,
        };

        if (slug.trim()) {
          payload.slug = slug.trim();
        }

        const res = await fetch('/api/proxy/admin/catalog/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          if (res.status === 409) {
            setError('Un modèle avec le même nom ou slug existe déjà pour cette marque.');
            setIsSubmitting(false);
            return;
          }
          const body = (await res.json().catch(() => null)) as
            | { message?: string | string[]; error?: { message?: string } }
            | null;
          const msg = Array.isArray(body?.message)
            ? body.message.join(', ')
            : body?.message || body?.error?.message || 'Erreur lors de la création du modèle.';
          setError(msg);
          setIsSubmitting(false);
          return;
        }
      } else {
        if (!modelToEdit) return;
        const payload: UpdateDeviceModelInput = {
          name: name.trim(),
          sortOrder: Number(sortOrder) || 0,
          categoryId: categoryId.trim() ? categoryId.trim() : null,
          active,
        };

        if (slug.trim()) {
          payload.slug = slug.trim();
        }

        const res = await fetch(`/api/proxy/admin/catalog/models/${encodeURIComponent(modelToEdit.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          if (res.status === 409) {
            setError('Un modèle avec le même nom ou slug existe déjà pour cette marque.');
            setIsSubmitting(false);
            return;
          }
          const body = (await res.json().catch(() => null)) as
            | { message?: string | string[]; error?: { message?: string } }
            | null;
          const msg = Array.isArray(body?.message)
            ? body.message.join(', ')
            : body?.message || body?.error?.message || 'Erreur lors de la mise à jour du modèle.';
          setError(msg);
          setIsSubmitting(false);
          return;
        }
      }

      setIsSubmitting(false);
      onSuccess();
      onClose();
    } catch {
      setError('Erreur réseau. Impossible de contacter le serveur.');
      setIsSubmitting(false);
    }
  };

  const currentBrandName =
    mode === 'edit'
      ? modelToEdit?.brandName || brands.find((b) => b.id === brandId)?.name || 'Marque'
      : brands.find((b) => b.id === brandId)?.name || '';

  const title = mode === 'edit' ? `Modifier le modèle : ${modelToEdit?.name ?? ''}` : 'Nouveau modèle';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1050,
        padding: '16px',
      }}
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-modal-title"
        style={{
          backgroundColor: 'var(--paper, #ffffff)',
          borderRadius: 'var(--r-card, 8px)',
          border: '1px solid var(--line, #dfe2e2)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '24px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="model-modal-title"
          style={{
            fontSize: '18px',
            fontWeight: 700,
            margin: '0 0 16px 0',
            color: 'var(--ink, #141414)',
          }}
        >
          {title}
        </h2>

        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 12px',
              backgroundColor: 'var(--red-soft, #feedf0)',
              border: '1px solid var(--badge-danger-border)',
              borderRadius: 'var(--r-field, 4px)',
              color: 'var(--red-text, #bd0e26)',
              fontSize: '13px',
              marginBottom: '16px',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Sélection de la marque */}
          <div>
            <label
              htmlFor="model-brand-select"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink, #141414)',
                marginBottom: '6px',
              }}
            >
              Marque <span style={{ color: 'var(--red-text, #bd0e26)' }}>*</span>
            </label>
            {mode === 'edit' ? (
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'var(--badge-neutral-bg)',
                  borderRadius: 'var(--r-field, 4px)',
                  border: '1px solid var(--line, #dfe2e2)',
                  fontSize: '14px',
                  color: 'var(--ink, #141414)',
                  fontWeight: 600,
                }}
              >
                {currentBrandName}
              </div>
            ) : (
              <select
                id="model-brand-select"
                required
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '14px',
                  borderRadius: 'var(--r-field, 4px)',
                  border: '1px solid var(--line, #dfe2e2)',
                  backgroundColor: 'var(--paper)',
                  boxSizing: 'border-box',
                }}
              >
                <option value="" disabled>
                  -- Choisir une marque --
                </option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Nom du modèle */}
          <div>
            <label
              htmlFor="model-name-input"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink, #141414)',
                marginBottom: '6px',
              }}
            >
              Nom du modèle <span style={{ color: 'var(--red-text, #bd0e26)' }}>*</span>
            </label>
            <input
              ref={nameInputRef}
              id="model-name-input"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : iPhone 15 Pro, Galaxy S24, V15 Detect..."
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '14px',
                borderRadius: 'var(--r-field, 4px)',
                border: '1px solid var(--line, #dfe2e2)',
                boxSizing: 'border-box',
              }}
            />
            {name.length > 0 && !isNameValid && (
              <span style={{ display: 'block', fontSize: '12px', color: 'var(--red-text, #bd0e26)', marginTop: '4px' }}>
                Le nom du modèle doit comporter au moins 2 caractères.
              </span>
            )}
          </div>

          {/* Slug URL */}
          <div>
            <label
              htmlFor="model-slug-input"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink, #141414)',
                marginBottom: '6px',
              }}
            >
              Slug URL (facultatif)
            </label>
            <input
              id="model-slug-input"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder={slugify(name) || 'ex: iphone-15-pro'}
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '13px',
                fontFamily: 'monospace',
                borderRadius: 'var(--r-field, 4px)',
                border: '1px solid var(--line, #dfe2e2)',
                boxSizing: 'border-box',
              }}
            />
            <span style={{ display: 'block', fontSize: '12px', color: 'var(--muted, #6b7280)', marginTop: '4px' }}>
              Aperçu du slug :{' '}
              <code style={{ fontFamily: 'monospace', color: 'var(--ink, #141414)', fontWeight: 600 }}>
                {autoSlugPreview || '—'}
              </code>
              {slug.trim() ? ' (personnalisé)' : ' (auto-dérivé)'}
            </span>
          </div>

          {/* Catégorie spécifique (override facultatif) */}
          <div>
            <label
              htmlFor="model-category-select"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink, #141414)',
                marginBottom: '6px',
              }}
            >
              Catégorie spécifique (facultative)
            </label>
            <select
              id="model-category-select"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '14px',
                borderRadius: 'var(--r-field, 4px)',
                border: '1px solid var(--line, #dfe2e2)',
                backgroundColor: 'var(--paper)',
                boxSizing: 'border-box',
              }}
            >
              <option value="">-- Héritée de la marque / Aucune spécifique --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.labelFr}
                </option>
              ))}
            </select>
            <span style={{ display: 'block', fontSize: '12px', color: 'var(--muted, #6b7280)', marginTop: '4px' }}>
              Permet de cibler précisément la sous-catégorie d&apos;appareil pour ce modèle.
            </span>
          </div>

          {/* Ordre d'affichage */}
          <div>
            <label
              htmlFor="model-sort-order-input"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink, #141414)',
                marginBottom: '6px',
              }}
            >
              Ordre d&apos;affichage
            </label>
            <input
              id="model-sort-order-input"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              disabled={isSubmitting}
              style={{
                width: '120px',
                padding: '8px 12px',
                fontSize: '14px',
                borderRadius: 'var(--r-field, 4px)',
                border: '1px solid var(--line, #dfe2e2)',
                boxSizing: 'border-box',
              }}
            />
            <span style={{ display: 'block', fontSize: '12px', color: 'var(--muted, #6b7280)', marginTop: '4px' }}>
              Position relative dans les listes de modèles.
            </span>
          </div>

          {/* Statut actif (mode édition) */}
          {mode === 'edit' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <input
                id="model-active-toggle"
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                disabled={isSubmitting}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label
                htmlFor="model-active-toggle"
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--ink, #141414)',
                  margin: 0,
                  cursor: 'pointer',
                }}
              >
                Modèle actif (sélectionnable par les utilisateurs)
              </label>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 500,
                backgroundColor: 'var(--paper)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-field, 4px)',
                color: 'var(--ink, #141414)',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: !canSubmit ? 'var(--faint)' : 'var(--accent, #141414)',
                border: 'none',
                borderRadius: 'var(--r-field, 4px)',
                color: '#ffffff',
                cursor: !canSubmit ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s ease',
              }}
            >
              {isSubmitting
                ? 'Enregistrement...'
                : mode === 'create'
                  ? 'Créer le modèle'
                  : 'Enregistrer les modifications'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
