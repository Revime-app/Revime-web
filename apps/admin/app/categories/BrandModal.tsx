'use client';

import { useEffect, useRef, useState } from 'react';
import type { AdminBrandListItem, CreateBrandInput, UpdateBrandInput } from '@revime/shared';

export interface BrandModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode: 'create' | 'edit';
  brandToEdit?: AdminBrandListItem | null;
  categories: Array<{ id: string; labelFr: string }>;
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function BrandModal({
  isOpen,
  onClose,
  onSuccess,
  mode,
  brandToEdit,
  categories,
}: BrandModalProps) {
  const [name, setName] = useState(mode === 'edit' && brandToEdit ? brandToEdit.name : '');
  const [slug, setSlug] = useState(mode === 'edit' && brandToEdit ? brandToEdit.slug : '');
  const [logoUrl, setLogoUrl] = useState(mode === 'edit' && brandToEdit ? (brandToEdit.logoUrl ?? '') : '');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
    mode === 'edit' && brandToEdit ? (brandToEdit.categories?.map((c) => c.id) ?? []) : []
  );
  const [sortOrder, setSortOrder] = useState<number>(mode === 'edit' && brandToEdit ? (brandToEdit.sortOrder ?? 0) : 0);
  const [active, setActive] = useState<boolean>(mode === 'edit' && brandToEdit ? (brandToEdit.active ?? true) : true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && brandToEdit) {
        setName(brandToEdit.name);
        setSlug(brandToEdit.slug);
        setLogoUrl(brandToEdit.logoUrl ?? '');
        setSelectedCategoryIds(brandToEdit.categories.map((c) => c.id));
        setSortOrder(brandToEdit.sortOrder ?? 0);
        setActive(brandToEdit.active ?? true);
      } else {
        setName('');
        setSlug('');
        setLogoUrl('');
        setSelectedCategoryIds([]);
        setSortOrder(0);
        setActive(true);
      }
      setError(null);
      setIsSubmitting(false);

      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, mode, brandToEdit]);

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
  const autoSlugPreview = slug.trim() || slugify(name);

  const toggleCategory = (catId: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNameValid || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      if (mode === 'create') {
        const payload: CreateBrandInput = {
          name: name.trim(),
          logoUrl: logoUrl.trim() || undefined,
          sortOrder: Number(sortOrder) || 0,
          categoryIds: selectedCategoryIds,
        };

        if (slug.trim()) {
          payload.slug = slug.trim();
        }

        const res = await fetch('/api/proxy/admin/catalog/brands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          if (res.status === 409) {
            setError('Une marque avec le même nom ou slug existe déjà.');
            setIsSubmitting(false);
            return;
          }
          const body = (await res.json().catch(() => null)) as
            | { message?: string | string[]; error?: { message?: string } }
            | null;
          const msg = Array.isArray(body?.message)
            ? body.message.join(', ')
            : body?.message || body?.error?.message || 'Erreur lors de la création de la marque.';
          setError(msg);
          setIsSubmitting(false);
          return;
        }
      } else {
        if (!brandToEdit) return;
        const payload: UpdateBrandInput = {
          name: name.trim(),
          logoUrl: logoUrl.trim() || null,
          sortOrder: Number(sortOrder) || 0,
          categoryIds: selectedCategoryIds,
          active,
        };

        if (slug.trim()) {
          payload.slug = slug.trim();
        }

        const res = await fetch(`/api/proxy/admin/catalog/brands/${encodeURIComponent(brandToEdit.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          if (res.status === 409) {
            setError('Une marque avec le même nom ou slug existe déjà.');
            setIsSubmitting(false);
            return;
          }
          const body = (await res.json().catch(() => null)) as
            | { message?: string | string[]; error?: { message?: string } }
            | null;
          const msg = Array.isArray(body?.message)
            ? body.message.join(', ')
            : body?.message || body?.error?.message || 'Erreur lors de la modification de la marque.';
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

  const title = mode === 'edit' ? `Modifier la marque : ${brandToEdit?.name ?? ''}` : 'Nouvelle marque';

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
        aria-labelledby="brand-modal-title"
        style={{
          backgroundColor: 'var(--paper, #ffffff)',
          borderRadius: 'var(--r-card, 8px)',
          border: '1px solid var(--line, #dfe2e2)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
          width: '100%',
          maxWidth: '540px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '24px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="brand-modal-title"
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
          {/* Nom de la marque */}
          <div>
            <label
              htmlFor="brand-name-input"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink, #141414)',
                marginBottom: '6px',
              }}
            >
              Nom de la marque <span style={{ color: 'var(--red-text, #bd0e26)' }}>*</span>
            </label>
            <input
              ref={nameInputRef}
              id="brand-name-input"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Apple, Samsung, Dyson, Bosch..."
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
                Le nom doit comporter au moins 2 caractères.
              </span>
            )}
          </div>

          {/* Slug URL */}
          <div>
            <label
              htmlFor="brand-slug-input"
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
              id="brand-slug-input"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder={slugify(name) || 'ex: apple'}
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

          {/* URL du logo */}
          <div>
            <label
              htmlFor="brand-logo-url-input"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink, #141414)',
                marginBottom: '6px',
              }}
            >
              URL du logo (facultatif)
            </label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                id="brand-logo-url-input"
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: '14px',
                  borderRadius: 'var(--r-field, 4px)',
                  border: '1px solid var(--line, #dfe2e2)',
                  boxSizing: 'border-box',
                }}
              />
              {logoUrl.trim() && (
                <div
                  data-testid="brand-logo-preview"
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: 'var(--r-field, 4px)',
                    border: '1px solid var(--line, #dfe2e2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    backgroundColor: '#ffffff', // keep-literal: a brand logo needs its own white ground in both themes
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={logoUrl.trim()}
                    alt="Aperçu du logo"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
            </div>
            <span style={{ display: 'block', fontSize: '12px', color: 'var(--muted, #6b7280)', marginTop: '4px' }}>
              Lien direct vers l&apos;image du logo (PNG, SVG, WEBP).
            </span>
          </div>

          {/* Catégories associées */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink, #141414)',
                marginBottom: '6px',
              }}
            >
              Catégories associées
            </label>
            <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: 'var(--muted, #6b7280)' }}>
              Sélectionnez les catégories pour lesquelles cette marque est proposée. Si aucune n&apos;est
              sélectionnée, la marque sera disponible pour toutes les catégories.
            </p>
            <div
              style={{
                maxHeight: '180px',
                overflowY: 'auto',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-field, 4px)',
                padding: '8px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                backgroundColor: 'var(--paper)',
              }}
            >
              {categories.length === 0 ? (
                <span style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}>
                  Aucune catégorie disponible.
                </span>
              ) : (
                categories.map((cat) => {
                  const isSelected = selectedCategoryIds.includes(cat.id);
                  return (
                    <label
                      key={cat.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '13px',
                        color: 'var(--ink, #141414)',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleCategory(cat.id)}
                        disabled={isSubmitting}
                        style={{ cursor: 'pointer', accentColor: 'var(--navy, #25324f)' }}
                      />
                      <span>{cat.labelFr}</span>
                    </label>
                  );
                })
              )}
            </div>
            {selectedCategoryIds.length > 0 && (
              <div style={{ marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedCategoryIds([])}
                  style={{
                    padding: 0,
                    background: 'none',
                    border: 'none',
                    fontSize: '11px',
                    color: 'var(--muted, #6b7280)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Désélectionner tout ({selectedCategoryIds.length} sélectionnée(s))
                </button>
              </div>
            )}
          </div>

          {/* Ordre d'affichage */}
          <div>
            <label
              htmlFor="brand-sort-order-input"
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
              id="brand-sort-order-input"
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

          {/* Statut actif (mode édition) */}
          {mode === 'edit' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <input
                id="brand-active-toggle"
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                disabled={isSubmitting}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label
                htmlFor="brand-active-toggle"
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--ink, #141414)',
                  margin: 0,
                  cursor: 'pointer',
                }}
              >
                Marque active (visible dans les formulaires et les recherches)
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
              disabled={!isNameValid || isSubmitting}
              style={{
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: !isNameValid || isSubmitting ? 'var(--faint)' : 'var(--navy, #25324f)',
                border: 'none',
                borderRadius: 'var(--r-field, 4px)',
                color: '#ffffff',
                cursor: !isNameValid || isSubmitting ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s ease',
              }}
            >
              {isSubmitting
                ? 'Enregistrement...'
                : mode === 'create'
                  ? 'Créer la marque'
                  : 'Enregistrer les modifications'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
