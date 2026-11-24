'use client';

import { useEffect, useRef, useState } from 'react';
import type { CreateFaultTypeInput, FaultTypeDto, UpdateFaultTypeInput } from '@revime/shared';

export interface FaultTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode: 'create' | 'edit';
  initialCategoryId?: string | null;
  categoriesList: Array<{ id: string; labelFr: string }>;
  faultTypeToEdit?: FaultTypeDto | null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function FaultTypeModal({
  isOpen,
  onClose,
  onSuccess,
  mode,
  initialCategoryId,
  categoriesList,
  faultTypeToEdit,
}: FaultTypeModalProps) {
  const [categoryId, setCategoryId] = useState<string>(
    mode === 'edit' && faultTypeToEdit
      ? faultTypeToEdit.categoryId
      : (initialCategoryId ?? '')
  );
  const [labelFr, setLabelFr] = useState(
    mode === 'edit' && faultTypeToEdit ? faultTypeToEdit.labelFr : ''
  );
  const [slug, setSlug] = useState(
    mode === 'edit' && faultTypeToEdit ? faultTypeToEdit.slug : ''
  );
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [description, setDescription] = useState(
    mode === 'edit' && faultTypeToEdit ? (faultTypeToEdit.description ?? '') : ''
  );
  const [icon, setIcon] = useState(
    mode === 'edit' && faultTypeToEdit ? (faultTypeToEdit.icon ?? '') : ''
  );
  const [sortOrder, setSortOrder] = useState<number>(
    mode === 'edit' && faultTypeToEdit ? faultTypeToEdit.sortOrder : 0
  );
  const [active, setActive] = useState<boolean>(
    mode === 'edit' && faultTypeToEdit ? faultTypeToEdit.active : true
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && faultTypeToEdit) {
        setCategoryId(faultTypeToEdit.categoryId);
        setLabelFr(faultTypeToEdit.labelFr);
        setSlug(faultTypeToEdit.slug);
        setIsSlugManuallyEdited(true);
        setDescription(faultTypeToEdit.description ?? '');
        setIcon(faultTypeToEdit.icon ?? '');
        setSortOrder(faultTypeToEdit.sortOrder);
        setActive(faultTypeToEdit.active);
      } else {
        setCategoryId(initialCategoryId ?? (categoriesList.length > 0 ? categoriesList[0].id : ''));
        setLabelFr('');
        setSlug('');
        setIsSlugManuallyEdited(false);
        setDescription('');
        setIcon('');
        setSortOrder(0);
        setActive(true);
      }
      setError(null);
      setIsSubmitting(false);

      setTimeout(() => {
        labelInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, mode, faultTypeToEdit, initialCategoryId, categoriesList]);

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

  const handleLabelChange = (newLabel: string) => {
    setLabelFr(newLabel);
    if (mode === 'create' && !isSlugManuallyEdited) {
      setSlug(slugify(newLabel));
    }
  };

  const handleSlugChange = (newSlug: string) => {
    setIsSlugManuallyEdited(true);
    setSlug(slugify(newSlug));
  };

  const isFormValid =
    categoryId.trim().length > 0 &&
    labelFr.trim().length >= 2 &&
    slug.trim().length >= 2;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      if (mode === 'create') {
        const payload: CreateFaultTypeInput = {
          categoryId: categoryId.trim(),
          labelFr: labelFr.trim(),
          slug: slug.trim(),
          description: description.trim() ? description.trim() : null,
          icon: icon.trim() ? icon.trim() : null,
          sortOrder: Number(sortOrder) || 0,
          active,
        };

        const res = await fetch('/api/proxy/admin/catalog/fault-types', {
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
            : body?.message || body?.error?.message || 'Erreur lors de la création du type de panne.';
          setError(msg);
          setIsSubmitting(false);
          return;
        }
      } else {
        if (!faultTypeToEdit) return;

        const payload: UpdateFaultTypeInput = {
          labelFr: labelFr.trim(),
          slug: slug.trim(),
          description: description.trim() ? description.trim() : null,
          icon: icon.trim() ? icon.trim() : null,
          sortOrder: Number(sortOrder) || 0,
          active,
        };

        const res = await fetch(`/api/proxy/admin/catalog/fault-types/${faultTypeToEdit.id}`, {
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
            : body?.message || body?.error?.message || 'Erreur lors de la mise à jour du type de panne.';
          setError(msg);
          setIsSubmitting(false);
          return;
        }
      }

      onSuccess();
    } catch {
      setError('Erreur réseau. Veuillez réessayer.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--paper, #ffffff)',
          borderRadius: 'var(--r-card, 6px)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          width: '100%',
          maxWidth: '540px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '24px',
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            borderBottom: '1px solid var(--line, #dfe2e2)',
            paddingBottom: '12px',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--ink, #141414)' }}>
            {mode === 'create' ? 'Nouveau type de panne' : 'Modifier le type de panne'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Fermer"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              color: 'var(--muted, #6b7280)',
              padding: '4px 8px',
              borderRadius: 'var(--r-field, 4px)',
            }}
          >
            ×
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              backgroundColor: 'var(--red-soft, #feedf0)',
              border: '1px solid var(--badge-danger-border)',
              borderRadius: 'var(--r-field, 4px)',
              color: 'var(--navy-text, #f61b39)',
              fontSize: '13px',
              marginBottom: '16px',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Category Select */}
          <div>
            <label
              htmlFor="fault-type-category-select"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink, #141414)',
                marginBottom: '6px',
              }}
            >
              Catégorie <span style={{ color: 'var(--navy-text, #f61b39)' }}>*</span>
            </label>
            <select
              id="fault-type-category-select"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={isSubmitting || mode === 'edit'}
              required
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '14px',
                borderRadius: 'var(--r-field, 4px)',
                border: '1px solid var(--line, #dfe2e2)',
                backgroundColor: mode === 'edit' ? 'var(--navy-soft, #f0f1f5)' : 'var(--paper, #ffffff)',
                color: 'var(--ink, #141414)',
                boxSizing: 'border-box',
              }}
            >
              <option value="">Sélectionner une catégorie...</option>
              {categoriesList.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.labelFr}
                </option>
              ))}
            </select>
          </div>

          {/* Label */}
          <div>
            <label
              htmlFor="fault-type-label-input"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink, #141414)',
                marginBottom: '6px',
              }}
            >
              Libellé de la panne <span style={{ color: 'var(--navy-text, #f61b39)' }}>*</span>
            </label>
            <input
              id="fault-type-label-input"
              ref={labelInputRef}
              type="text"
              value={labelFr}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="Ex : Écran tactile fissuré, Problème de charge..."
              disabled={isSubmitting}
              required
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '14px',
                borderRadius: 'var(--r-field, 4px)',
                border: '1px solid var(--line, #dfe2e2)',
                backgroundColor: 'var(--paper, #ffffff)',
                color: 'var(--ink, #141414)',
                boxSizing: 'border-box',
              }}
            />
            <span style={{ display: 'block', fontSize: '12px', color: 'var(--muted, #6b7280)', marginTop: '4px' }}>
              Nom public de l&apos;anomalie ou diagnostic proposé au client.
            </span>
          </div>

          {/* Slug */}
          <div>
            <label
              htmlFor="fault-type-slug-input"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink, #141414)',
                marginBottom: '6px',
              }}
            >
              Slug <span style={{ color: 'var(--navy-text, #f61b39)' }}>*</span>
            </label>
            <input
              id="fault-type-slug-input"
              type="text"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="ex: ecran-tactile-fissure"
              disabled={isSubmitting}
              required
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '13px',
                fontFamily: 'monospace',
                borderRadius: 'var(--r-field, 4px)',
                border: '1px solid var(--line, #dfe2e2)',
                backgroundColor: 'var(--paper, #ffffff)',
                color: 'var(--ink, #141414)',
                boxSizing: 'border-box',
              }}
            />
            <span style={{ display: 'block', fontSize: '12px', color: 'var(--muted, #6b7280)', marginTop: '4px' }}>
              Identifiant URL unique (minuscules, chiffres et tirets).
            </span>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="fault-type-description-input"
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
              id="fault-type-description-input"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description détaillée des symptômes ou du diagnostic associé..."
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '13px',
                fontFamily: 'inherit',
                borderRadius: 'var(--r-field, 4px)',
                border: '1px solid var(--line, #dfe2e2)',
                backgroundColor: 'var(--paper, #ffffff)',
                color: 'var(--ink, #141414)',
                boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Icon & Sort Order Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label
                htmlFor="fault-type-icon-input"
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
                id="fault-type-icon-input"
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="Ex : smartphone ou batterie"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '14px',
                  borderRadius: 'var(--r-field, 4px)',
                  border: '1px solid var(--line, #dfe2e2)',
                  backgroundColor: 'var(--paper, #ffffff)',
                  color: 'var(--ink, #141414)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="fault-type-sort-order-input"
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
                id="fault-type-sort-order-input"
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '14px',
                  borderRadius: 'var(--r-field, 4px)',
                  border: '1px solid var(--line, #dfe2e2)',
                  backgroundColor: 'var(--paper, #ffffff)',
                  color: 'var(--ink, #141414)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Active Checkbox */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <input
              id="fault-type-active-checkbox"
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              disabled={isSubmitting}
              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
            />
            <label
              htmlFor="fault-type-active-checkbox"
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink, #141414)',
                cursor: 'pointer',
              }}
            >
              Statut actif (visible dans le formulaire de dépôt client)
            </label>
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
                backgroundColor: 'var(--paper, #ffffff)',
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
              disabled={!isFormValid || isSubmitting}
              style={{
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: !isFormValid || isSubmitting ? 'var(--faint)' : 'var(--navy, #25324f)',
                border: 'none',
                borderRadius: 'var(--r-field, 4px)',
                color: '#ffffff',
                cursor: !isFormValid || isSubmitting ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s ease',
              }}
            >
              {isSubmitting
                ? 'Enregistrement...'
                : mode === 'create'
                  ? 'Créer le type de panne'
                  : 'Enregistrer les modifications'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
