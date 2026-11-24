'use client';

import { useEffect, useRef, useState } from 'react';
import type { AdminCategoryTreeItem } from '@revime/shared';

export interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode: 'create' | 'edit';
  categoryToEdit?: AdminCategoryTreeItem | null;
  initialParentId?: string | null;
  rootCategories: Array<{ id: string; labelFr: string }>;
}

export function CategoryModal({
  isOpen,
  onClose,
  onSuccess,
  mode,
  categoryToEdit,
  initialParentId,
  rootCategories,
}: CategoryModalProps) {
  const [labelFr, setLabelFr] = useState(
    mode === 'edit' && categoryToEdit ? categoryToEdit.labelFr : ''
  );
  const [slug, setSlug] = useState(
    mode === 'edit' && categoryToEdit ? categoryToEdit.slug : ''
  );
  const [icon, setIcon] = useState(
    mode === 'edit' && categoryToEdit ? (categoryToEdit.icon ?? '') : ''
  );
  const [description, setDescription] = useState(
    mode === 'edit' && categoryToEdit ? (categoryToEdit.description ?? '') : ''
  );
  const [sortOrder, setSortOrder] = useState<number>(
    mode === 'edit' && categoryToEdit ? (categoryToEdit.sortOrder ?? 0) : 0
  );
  const [parentId, setParentId] = useState<string>(
    mode === 'edit' && categoryToEdit
      ? (categoryToEdit.parentId ?? '')
      : (initialParentId ?? '')
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && categoryToEdit) {
        setLabelFr(categoryToEdit.labelFr);
        setSlug(categoryToEdit.slug);
        setIcon(categoryToEdit.icon ?? '');
        setDescription(categoryToEdit.description ?? '');
        setSortOrder(categoryToEdit.sortOrder ?? 0);
        setParentId(categoryToEdit.parentId ?? '');
      } else {
        setLabelFr('');
        setSlug('');
        setIcon('');
        setDescription('');
        setSortOrder(0);
        setParentId(initialParentId ?? '');
      }
      setError(null);
      setIsSubmitting(false);

      // Focus label input after modal render
      setTimeout(() => {
        labelInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, mode, categoryToEdit, initialParentId]);

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

  const isLabelValid = labelFr.trim().length >= 2;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLabelValid || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      if (mode === 'create') {
        const payload: {
          labelFr: string;
          slug?: string;
          parentId?: string | null;
          icon?: string | null;
          description?: string | null;
          sortOrder?: number;
        } = {
          labelFr: labelFr.trim(),
          sortOrder: Number(sortOrder) || 0,
        };

        if (slug.trim()) {
          payload.slug = slug.trim();
        }
        if (parentId.trim()) {
          payload.parentId = parentId.trim();
        }
        if (icon.trim()) {
          payload.icon = icon.trim();
        }
        if (description.trim()) {
          payload.description = description.trim();
        }

        const res = await fetch('/api/proxy/admin/catalog/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { message?: string | string[]; error?: { message?: string } }
            | null;
          const msg = Array.isArray(body?.message)
            ? body.message.join(', ')
            : body?.message || body?.error?.message || 'Erreur lors de la création de la catégorie.';
          setError(msg);
          setIsSubmitting(false);
          return;
        }
      } else {
        if (!categoryToEdit) return;
        const payload: {
          labelFr: string;
          slug?: string;
          icon?: string | null;
          description?: string | null;
          sortOrder?: number;
        } = {
          labelFr: labelFr.trim(),
          sortOrder: Number(sortOrder) || 0,
          icon: icon.trim() || null,
          description: description.trim() || null,
        };

        if (slug.trim()) {
          payload.slug = slug.trim();
        }

        const res = await fetch(`/api/proxy/admin/catalog/categories/${encodeURIComponent(categoryToEdit.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { message?: string | string[]; error?: { message?: string } }
            | null;
          const msg = Array.isArray(body?.message)
            ? body.message.join(', ')
            : body?.message || body?.error?.message || 'Erreur lors de la mise à jour de la catégorie.';
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

  const isSubCategoryCreation = mode === 'create' && Boolean(parentId);
  const title =
    mode === 'edit'
      ? `Modifier : ${categoryToEdit?.labelFr ?? 'Catégorie'}`
      : isSubCategoryCreation
        ? 'Ajouter une sous-catégorie'
        : 'Nouvelle catégorie principale';

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
        aria-labelledby="category-modal-title"
        style={{
          backgroundColor: 'var(--paper, #ffffff)',
          borderRadius: 'var(--r-card, 8px)',
          border: '1px solid var(--line, #dfe2e2)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
          width: '100%',
          maxWidth: '520px',
          padding: '24px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="category-modal-title"
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
          {/* Parent category selector (when creating) */}
          {mode === 'create' && (
            <div>
              <label
                htmlFor="category-parent-select"
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--ink, #141414)',
                  marginBottom: '6px',
                }}
              >
                Catégorie parente
              </label>
              <select
                id="category-parent-select"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
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
                <option value="">-- Aucune (catégorie principale racine) --</option>
                {rootCategories.map((rc) => (
                  <option key={rc.id} value={rc.id}>
                    {rc.labelFr}
                  </option>
                ))}
              </select>
              <span style={{ display: 'block', fontSize: '12px', color: 'var(--muted, #6b7280)', marginTop: '4px' }}>
                Laissez vide pour créer une catégorie racine. Sélectionnez une parente pour une sous-catégorie.
              </span>
            </div>
          )}

          {/* If editing and has parentId */}
          {mode === 'edit' && categoryToEdit?.parentId && (
            <div
              style={{
                padding: '8px 12px',
                backgroundColor: 'var(--badge-neutral-bg)',
                borderRadius: 'var(--r-field, 4px)',
                border: '1px solid var(--line, #dfe2e2)',
                fontSize: '13px',
                color: 'var(--muted, #6b7280)',
              }}
            >
              <strong>Sous-catégorie de :</strong>{' '}
              {rootCategories.find((rc) => rc.id === categoryToEdit.parentId)?.labelFr ?? 'Catégorie parente'}
            </div>
          )}

          {/* Libellé FR */}
          <div>
            <label
              htmlFor="category-label-input"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink, #141414)',
                marginBottom: '6px',
              }}
            >
              Libellé (Français) <span style={{ color: 'var(--red-text, #bd0e26)' }}>*</span>
            </label>
            <input
              ref={labelInputRef}
              id="category-label-input"
              type="text"
              required
              value={labelFr}
              onChange={(e) => setLabelFr(e.target.value)}
              placeholder="Ex : Téléphones & Tablettes, Informatique..."
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
            {labelFr.length > 0 && !isLabelValid && (
              <span style={{ display: 'block', fontSize: '12px', color: 'var(--red-text, #bd0e26)', marginTop: '4px' }}>
                Le libellé doit comporter au moins 2 caractères.
              </span>
            )}
          </div>

          {/* Slug */}
          <div>
            <label
              htmlFor="category-slug-input"
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
              id="category-slug-input"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="Ex : telephonie-tablettes (généré auto si vide)"
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
              Identifiant URL unique. Si laissé vide, il sera automatiquement dérivé du libellé.
            </span>
          </div>

          {/* Icône ou émoji */}
          <div>
            <label
              htmlFor="category-icon-input"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink, #141414)',
                marginBottom: '6px',
              }}
            >
              Icône ou émoji
            </label>
            <input
              id="category-icon-input"
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="Ex : smartphone"
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
            <span style={{ display: 'block', fontSize: '12px', color: 'var(--muted, #6b7280)', marginTop: '4px' }}>
              Émoji ou identifiant d&apos;icône pour illustrer la catégorie.
            </span>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="category-description-input"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink, #141414)',
                marginBottom: '6px',
              }}
            >
              Description
            </label>
            <textarea
              id="category-description-input"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description courte de la catégorie..."
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '13px',
                fontFamily: 'inherit',
                borderRadius: 'var(--r-field, 4px)',
                border: '1px solid var(--line, #dfe2e2)',
                boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Sort Order */}
          <div>
            <label
              htmlFor="category-sort-order-input"
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
              id="category-sort-order-input"
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
              Position relative dans les listes (les nombres inférieurs apparaissent en premier).
            </span>
          </div>

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
              disabled={!isLabelValid || isSubmitting}
              style={{
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: !isLabelValid || isSubmitting ? 'var(--faint)' : 'var(--navy, #25324f)',
                border: 'none',
                borderRadius: 'var(--r-field, 4px)',
                color: '#ffffff',
                cursor: !isLabelValid || isSubmitting ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s ease',
              }}
            >
              {isSubmitting
                ? 'Enregistrement...'
                : mode === 'create'
                  ? 'Créer la catégorie'
                  : 'Enregistrer les modifications'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
