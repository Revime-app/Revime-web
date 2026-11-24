'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdminDemandeDetail, CategoryDto } from '@revime/shared';

type DemandeActionFormsProps = {
  id: string;
  categoryId: string;
  state: AdminDemandeDetail['state'];
  paymentInFlight: boolean;
  busy: boolean;
  act: (
    path: string,
    method: 'PATCH' | 'DELETE',
    body: unknown,
    successMessage: string,
    confirmText: string | null,
  ) => Promise<void>;
  /** Seeds the list (specs); the page lets the form fetch `/admin/categories`, which is already filtered to usable ones. */
  initialCategories?: CategoryDto[];
};

export function DemandeActionForms({
  id,
  categoryId,
  state,
  paymentInFlight,
  busy,
  act,
  initialCategories,
}: DemandeActionFormsProps) {
  const [categories, setCategories] = useState<CategoryDto[]>(initialCategories ?? []);
  const [newCategoryId, setNewCategoryId] = useState(categoryId);
  const [hideReason, setHideReason] = useState('');
  const [deleteReason, setDeleteReason] = useState('');

  // Load categories on mount if not provided
  useEffect(() => {
    if (initialCategories) return;
    async function loadCategories() {
      try {
        const r = await fetch('/api/proxy/admin/categories');
        if (r.ok) {
          setCategories((await r.json()) as CategoryDto[]);
        }
      } catch {
        // Failed to load categories; the dropdown will be empty
      }
    }
    void loadCategories();
  }, [initialCategories]);

  // 🛑 These four strings are the defect Task 10 of piece B2 shipped: four paths that all
  // 404'd while typecheck, the admin tests and `next build` were green. They are pinned by
  // `admin-route-coverage.spec.ts`, method included. If you change one, run that gate.
  const hide = () => {
    if (paymentInFlight) return;
    act(`admin/demandes/${id}/hide`, 'PATCH', { reason: hideReason }, 'Demande masquée.', null);
  };
  const unhide = () =>
    act(`admin/demandes/${id}/unhide`, 'PATCH', {}, 'Demande réaffichée.', null);
  const remove = () => {
    if (paymentInFlight) return;
    act(
      `admin/demandes/${id}`,
      'DELETE',
      { reason: deleteReason },
      'Demande supprimée.',
      'Supprimer définitivement cette demande ? Cette action est irréversible.',
    );
  };
  const changeCategory = () =>
    act(
      `admin/demandes/${id}/category`,
      'PATCH',
      { categoryId: newCategoryId },
      'Catégorie modifiée.',
      null,
    );

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <h2 style={{ fontSize: '18px', marginBottom: '1rem' }}>Actions</h2>

      {paymentInFlight && (
        <div
          data-testid="demande-payment-in-flight-actions-notice"
          role="status"
          style={{
            padding: '10px 14px',
            marginBottom: '1rem',
            backgroundColor: 'var(--red-soft, #fef2f2)',
            color: 'var(--red-text, #bd0e26)',
            borderRadius: 'var(--r-field, 4px)',
            fontSize: '13px',
            lineHeight: 1.4,
          }}
        >
          <strong>Action refusée :</strong> Le masquage et la suppression sont temporairement désactivés car un paiement est en cours sur cette demande.
        </div>
      )}

      {/* Change category */}
      <details style={{ marginBottom: '1rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Changer la catégorie</summary>
        <div style={{ marginTop: '0.75rem' }}>
          <label style={{ display: 'block', marginBottom: '0.75rem' }}>
            Nouvelle catégorie :
            <select
              value={newCategoryId}
              onChange={(e) => setNewCategoryId(e.target.value)}
              style={{ width: '100%', marginTop: '0.25rem' }}
              disabled={busy}
            >
              {/* Placeholder selected when the held value has no matching option (e.g., deactivated category) */}
              <option value="" disabled>
                Choisir une catégorie
              </option>
              {categories
                .filter((c) => !c.parentId)
                .map((parent) => {
                  const children = categories.filter((c) => c.parentId === parent.id);
                  return (
                    <optgroup key={parent.id} label={parent.labelFr}>
                      <option value={parent.id}>{parent.labelFr}</option>
                      {children.map((child) => (
                        <option key={child.id} value={child.id}>
                          {child.labelFr}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
            </select>
          </label>
          <button
            type="button"
            onClick={changeCategory}
            disabled={busy || newCategoryId === categoryId}
          >
            Changer la catégorie
          </button>
        </div>
      </details>

      {/* Hide */}
      {state === 'visible' && (
        <details open={paymentInFlight ? false : undefined} style={{ marginBottom: '1rem' }}>
          <summary
            data-testid="hide-demande-summary"
            aria-disabled={paymentInFlight}
            onClick={(e) => {
              if (paymentInFlight) e.preventDefault();
            }}
            onKeyDown={(e) => {
              if (paymentInFlight && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
              }
            }}
            style={{
              cursor: paymentInFlight ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              opacity: paymentInFlight ? 0.6 : 1,
              color: paymentInFlight ? 'var(--muted, #6b7280)' : undefined,
              userSelect: 'none',
            }}
          >
            Masquer la demande
            {paymentInFlight && (
              <span style={{ marginLeft: '0.5rem', fontSize: '13px', fontWeight: 400, color: 'var(--muted, #6b7280)' }}>
                (action refusée : paiement en cours)
              </span>
            )}
          </summary>
          <div style={{ marginTop: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              Motif (obligatoire) :
              <input
                data-testid="hide-demande-reason"
                type="text"
                value={hideReason}
                onChange={(e) => setHideReason(e.target.value)}
                style={{ width: '100%', marginTop: '0.25rem' }}
                disabled={busy || paymentInFlight}
              />
            </label>
            <button
              data-testid="hide-demande-button"
              type="button"
              onClick={hide}
              disabled={busy || !hideReason.trim() || paymentInFlight}
              style={{
                cursor: busy || !hideReason.trim() || paymentInFlight ? 'not-allowed' : 'pointer',
              }}
            >
              Masquer
            </button>
          </div>
        </details>
      )}

      {/* Unhide */}
      {state === 'masquee' && (
        <div style={{ marginBottom: '1rem' }}>
          <button type="button" onClick={unhide} disabled={busy}>
            Réafficher la demande
          </button>
        </div>
      )}

      {/* Delete */}
      {state !== 'supprimee' && (
        <details open={paymentInFlight ? false : undefined} style={{ marginBottom: '1rem' }}>
          <summary
            data-testid="delete-demande-summary"
            aria-disabled={paymentInFlight}
            onClick={(e) => {
              if (paymentInFlight) e.preventDefault();
            }}
            onKeyDown={(e) => {
              if (paymentInFlight && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
              }
            }}
            style={{
              cursor: paymentInFlight ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              color: paymentInFlight ? 'var(--muted, #6b7280)' : 'var(--red-text)',
              opacity: paymentInFlight ? 0.6 : 1,
              userSelect: 'none',
            }}
          >
            Supprimer la demande
            {paymentInFlight && (
              <span style={{ marginLeft: '0.5rem', fontSize: '13px', fontWeight: 400, color: 'var(--muted, #6b7280)' }}>
                (action refusée : paiement en cours)
              </span>
            )}
          </summary>
          <div style={{ marginTop: '0.75rem' }}>
            <p style={{ marginBottom: '0.5rem', color: 'var(--muted)' }}>
              Cette action est irréversible. La demande sera définitivement supprimée.
            </p>
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              Motif (obligatoire) :
              <input
                data-testid="delete-demande-reason"
                type="text"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                style={{ width: '100%', marginTop: '0.25rem' }}
                disabled={busy || paymentInFlight}
              />
            </label>
            <button
              data-testid="delete-demande-button"
              type="button"
              onClick={remove}
              disabled={busy || !deleteReason.trim() || paymentInFlight}
              style={{
                background: (paymentInFlight || busy || !deleteReason.trim()) ? 'var(--muted, #6b7280)' : 'var(--red-deep)',
                cursor: busy || !deleteReason.trim() || paymentInFlight ? 'not-allowed' : 'pointer',
              }}
            >
              Supprimer
            </button>
          </div>
        </details>
      )}

      <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--line)' }}>
        <Link href="/demandes">← Retour à la liste</Link>
      </div>
    </div>
  );
}
