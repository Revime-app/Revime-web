'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminCategoryTreeItem, FaultTypeDto } from '@revime/shared';
import { FaultTypeModal } from './FaultTypeModal';
import { Wrench } from 'lucide-react';
import { Icon } from '../../components/Icon';

export interface FaultTypesCatalogViewProps {
  onRefreshOverview?: () => void;
  createFaultTypeSignal?: number;
  initialFaultTypes?: FaultTypeDto[];
  initialCategories?: AdminCategoryTreeItem[];
}

function flattenCategories(items: AdminCategoryTreeItem[]): Array<{ id: string; labelFr: string }> {
  const list: Array<{ id: string; labelFr: string }> = [];
  for (const item of items) {
    list.push({ id: item.id, labelFr: item.labelFr });
    if (item.children && item.children.length > 0) {
      for (const child of item.children) {
        list.push({ id: child.id, labelFr: `${item.labelFr} › ${child.labelFr}` });
      }
    }
  }
  return list;
}

export function FaultTypesCatalogView({
  onRefreshOverview,
  createFaultTypeSignal,
  initialFaultTypes,
  initialCategories,
}: FaultTypesCatalogViewProps) {
  // Category & search filter state
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [filterDraft, setFilterDraft] = useState('');
  const [filterQuery, setFilterQuery] = useState('');

  // Categories list
  const [flatCategories, setFlatCategories] = useState<Array<{ id: string; labelFr: string }>>(() =>
    initialCategories ? flattenCategories(initialCategories) : []
  );

  // Fault types data
  const [faultTypes, setFaultTypes] = useState<FaultTypeDto[]>(initialFaultTypes ?? []);
  const [loading, setLoading] = useState(!initialFaultTypes);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [faultTypeToEdit, setFaultTypeToEdit] = useState<FaultTypeDto | null>(null);

  // Reordering & action loading states
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilterQuery(filterDraft);
    }, 250);
    return () => clearTimeout(timer);
  }, [filterDraft]);

  // Load categories if not provided
  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/admin/catalog/categories');
      if (res.ok) {
        const data = (await res.json()) as AdminCategoryTreeItem[];
        setFlatCategories(flattenCategories(data));
      }
    } catch {
      // Ignored
    }
  }, []);

  // Fetch fault types
  const fetchFaultTypes = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (selectedCategoryId) {
      params.set('categoryId', selectedCategoryId);
    }
    if (filterQuery.trim()) {
      params.set('q', filterQuery.trim());
    }

    try {
      const queryStr = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/proxy/admin/catalog/fault-types${queryStr}`);
      if (!res.ok) {
        setError('Impossible de charger les types de panne.');
        setLoading(false);
        return;
      }
      const data = (await res.json()) as FaultTypeDto[];
      setFaultTypes(data);
      setLoading(false);
    } catch {
      setError('Erreur réseau lors du chargement des types de panne.');
      setLoading(false);
    }
  }, [selectedCategoryId, filterQuery]);

  useEffect(() => {
    if (!initialCategories) {
      void fetchCategories();
    }
  }, [fetchCategories, initialCategories]);

  useEffect(() => {
    if (!initialFaultTypes || selectedCategoryId !== '' || filterQuery !== '') {
      void fetchFaultTypes();
    }
  }, [fetchFaultTypes, selectedCategoryId, filterQuery, initialFaultTypes]);

  // External signal handling to open create modal
  const prevFaultTypeSignalRef = useRef(createFaultTypeSignal);
  useEffect(() => {
    if (createFaultTypeSignal !== undefined && createFaultTypeSignal !== prevFaultTypeSignalRef.current) {
      prevFaultTypeSignalRef.current = createFaultTypeSignal;
      handleOpenCreate();
    }
  }, [createFaultTypeSignal]);

  const handleOpenCreate = () => {
    setModalMode('create');
    setFaultTypeToEdit(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (ft: FaultTypeDto) => {
    setModalMode('edit');
    setFaultTypeToEdit(ft);
    setModalOpen(true);
  };

  const handleModalSuccess = () => {
    setModalOpen(false);
    setActionSuccess(
      modalMode === 'create'
        ? 'Type de panne créé avec succès.'
        : 'Type de panne modifié avec succès.'
    );
    void fetchFaultTypes();
    onRefreshOverview?.();
  };

  // Status toggle handler
  const handleToggleActive = async (ft: FaultTypeDto) => {
    setTogglingId(ft.id);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`/api/proxy/admin/catalog/fault-types/${ft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !ft.active }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setActionError(data?.error?.message || 'Erreur lors de la mise à jour du statut.');
        setTogglingId(null);
        return;
      }

      setFaultTypes((prev) =>
        prev.map((item) => (item.id === ft.id ? { ...item, active: !item.active } : item))
      );
      setActionSuccess(`Statut mis à jour : ${!ft.active ? 'Actif' : 'Inactif'}.`);
      onRefreshOverview?.();
    } catch {
      setActionError('Erreur réseau lors de la mise à jour du statut.');
    } finally {
      setTogglingId(null);
    }
  };

  // Delete handler
  const handleDelete = async (ft: FaultTypeDto) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer le type de panne "${ft.labelFr}" ?`)) {
      return;
    }

    setDeletingId(ft.id);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`/api/proxy/admin/catalog/fault-types/${ft.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setActionError(data?.error?.message || 'Erreur lors de la suppression du type de panne.');
        setDeletingId(null);
        return;
      }

      setFaultTypes((prev) => prev.filter((item) => item.id !== ft.id));
      setActionSuccess('Type de panne supprimé avec succès.');
      onRefreshOverview?.();
    } catch {
      setActionError('Erreur réseau lors de la suppression.');
    } finally {
      setDeletingId(null);
    }
  };

  // Reorder handler
  const handleReorder = async (ft: FaultTypeDto, direction: 'up' | 'down') => {
    // Filter the items belonging to the same category
    const categoryItems = faultTypes.filter((item) => item.categoryId === ft.categoryId);
    const index = categoryItems.findIndex((item) => item.id === ft.id);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === categoryItems.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newCategoryItems = [...categoryItems];
    const [moved] = newCategoryItems.splice(index, 1);
    newCategoryItems.splice(targetIndex, 0, moved);

    const orderedIds = newCategoryItems.map((item) => item.id);

    setReorderingId(ft.id);
    setActionError(null);

    try {
      const res = await fetch('/api/proxy/admin/catalog/fault-types/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: ft.categoryId,
          orderedIds,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setActionError(data?.error?.message || 'Erreur lors du réordonnancement.');
        setReorderingId(null);
        return;
      }

      void fetchFaultTypes();
      onRefreshOverview?.();
    } catch {
      setActionError('Erreur réseau lors du réordonnancement.');
    } finally {
      setReorderingId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Action feedback banners */}
      {actionError && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--red-soft, #feedf0)',
            border: '1px solid var(--badge-danger-border)',
            borderRadius: 'var(--r-field, 4px)',
            color: 'var(--navy-text, #f61b39)',
            fontSize: '13px',
          }}
        >
          {actionError}
        </div>
      )}

      {actionSuccess && (
        <div
          role="status"
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--badge-success-bg)',
            border: '1px solid var(--badge-success-border)',
            borderRadius: 'var(--r-field, 4px)',
            color: 'var(--badge-success-text)',
            fontSize: '13px',
          }}
        >
          {actionSuccess}
        </div>
      )}

      {/* Filter Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          backgroundColor: 'var(--paper, #ffffff)',
          padding: '16px',
          borderRadius: 'var(--r-card, 6px)',
          border: '1px solid var(--line, #dfe2e2)',
        }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
          {/* Category Dropdown */}
          <div style={{ minWidth: '220px' }}>
            <select
              aria-label="Filtrer par catégorie"
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '13px',
                borderRadius: 'var(--r-field, 4px)',
                border: '1px solid var(--line, #dfe2e2)',
                backgroundColor: 'var(--paper, #ffffff)',
                color: 'var(--ink, #141414)',
              }}
            >
              <option value="">Toutes les catégories</option>
              {flatCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.labelFr}
                </option>
              ))}
            </select>
          </div>

          {/* Search Input */}
          <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '360px' }}>
            <input
              type="text"
              value={filterDraft}
              onChange={(e) => setFilterDraft(e.target.value)}
              placeholder="Rechercher un type de panne..."
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '13px',
                borderRadius: 'var(--r-field, 4px)',
                border: '1px solid var(--line, #dfe2e2)',
                backgroundColor: 'var(--paper, #ffffff)',
                color: 'var(--ink, #141414)',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Quick Add Button */}
        <button
          type="button"
          onClick={handleOpenCreate}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 600,
            backgroundColor: 'var(--navy, #25324f)',
            color: '#ffffff',
            border: 'none',
            borderRadius: 'var(--r-field, 4px)',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
          }}
        >
          + Nouveau type de panne
        </button>
      </div>

      {/* Main Table / Empty State */}
      {loading ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted, #6b7280)' }}>
          Chargement des types de panne...
        </div>
      ) : error ? (
        <div
          role="alert"
          style={{
            padding: '16px',
            backgroundColor: 'var(--red-soft, #feedf0)',
            color: 'var(--navy-text, #f61b39)',
            borderRadius: 'var(--r-field, 4px)',
            border: '1px solid var(--badge-danger-border)',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      ) : faultTypes.length === 0 ? (
        <div
          style={{
            backgroundColor: 'var(--paper, #ffffff)',
            borderRadius: 'var(--r-card, 6px)',
            border: '1px solid var(--line, #dfe2e2)',
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '12px' }}><Icon as={Wrench} /></div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: 'var(--ink, #141414)' }}>
            Aucun type de panne répertorié
          </h3>
          <p style={{ margin: '0 0 20px 0', color: 'var(--muted, #6b7280)', fontSize: '14px' }}>
            {selectedCategoryId || filterQuery
              ? 'Aucun résultat ne correspond aux filtres appliqués.'
              : 'Commencez par créer le premier type de panne pour vos catégories d’équipements.'}
          </p>
          <button
            type="button"
            onClick={handleOpenCreate}
            style={{
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: 'var(--navy, #25324f)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--r-field, 4px)',
              cursor: 'pointer',
            }}
          >
            + Nouveau type de panne
          </button>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: 'var(--paper, #ffffff)',
            borderRadius: 'var(--r-card, 6px)',
            border: '1px solid var(--line, #dfe2e2)',
            overflowX: 'auto',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '13px',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--line, #dfe2e2)',
                  backgroundColor: 'var(--navy-soft, #f0f1f5)',
                  color: 'var(--ink, #141414)',
                  fontWeight: 600,
                }}
              >
                <th style={{ padding: '12px 14px', width: '90px' }}>Ordre</th>
                <th style={{ padding: '12px 14px' }}>Type de panne</th>
                <th style={{ padding: '12px 14px' }}>Catégorie</th>
                <th style={{ padding: '12px 14px', textAlign: 'center' }}>Demandes</th>
                <th style={{ padding: '12px 14px', textAlign: 'center' }}>Statut</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {faultTypes.map((ft, idx) => (
                <tr
                  key={ft.id}
                  style={{
                    borderBottom: '1px solid var(--line, #dfe2e2)',
                    transition: 'background-color 0.1s ease',
                  }}
                >
                  {/* Ordre */}
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--muted, #6b7280)', minWidth: '18px' }}>
                        {ft.sortOrder}
                      </span>
                      <button
                        type="button"
                        aria-label={`Monter ${ft.labelFr}`}
                        disabled={reorderingId === ft.id || idx === 0}
                        onClick={() => handleReorder(ft, 'up')}
                        style={{
                          background: 'none',
                          border: '1px solid var(--line, #dfe2e2)',
                          borderRadius: 'var(--r-field, 4px)',
                          padding: '2px 6px',
                          cursor: reorderingId === ft.id || idx === 0 ? 'not-allowed' : 'pointer',
                          color: 'var(--navy-text, #25324f)',
                          fontSize: '11px',
                          backgroundColor: 'var(--paper, #ffffff)',
                        }}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        aria-label={`Descendre ${ft.labelFr}`}
                        disabled={reorderingId === ft.id || idx === faultTypes.length - 1}
                        onClick={() => handleReorder(ft, 'down')}
                        style={{
                          background: 'none',
                          border: '1px solid var(--line, #dfe2e2)',
                          borderRadius: 'var(--r-field, 4px)',
                          padding: '2px 6px',
                          cursor:
                            reorderingId === ft.id || idx === faultTypes.length - 1
                              ? 'not-allowed'
                              : 'pointer',
                          color: 'var(--navy-text, #25324f)',
                          fontSize: '11px',
                          backgroundColor: 'var(--paper, #ffffff)',
                        }}
                      >
                        ▼
                      </button>
                    </div>
                  </td>

                  {/* Type de panne */}
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {ft.icon && <span style={{ fontSize: '16px' }}>{ft.icon}</span>}
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>
                          {ft.labelFr}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: '11px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'var(--navy-soft, #f0f1f5)',
                              color: 'var(--navy-text, #25324f)',
                            }}
                          >
                            {ft.slug}
                          </span>
                          {ft.description && (
                            <span
                              style={{
                                fontSize: '12px',
                                color: 'var(--muted, #6b7280)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '300px',
                              }}
                              title={ft.description}
                            >
                              — {ft.description}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Catégorie */}
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 500,
                        backgroundColor: 'var(--navy-soft, #f0f1f5)',
                        color: 'var(--navy-text, #25324f)',
                        border: '1px solid var(--line, #dfe2e2)',
                      }}
                    >
                      {ft.categoryLabelFr || 'Catégorie'}
                    </span>
                  </td>

                  {/* Demandes */}
                  <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '10px',
                        fontSize: '12px',
                        fontWeight: 600,
                        backgroundColor: 'var(--paper)',
                        border: '1px solid var(--line, #dfe2e2)',
                        color: 'var(--ink, #141414)',
                      }}
                    >
                      {ft.demandesCount ?? 0}
                    </span>
                  </td>

                  {/* Statut Toggle */}
                  <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      disabled={togglingId === ft.id}
                      onClick={() => handleToggleActive(ft)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: togglingId === ft.id ? 'not-allowed' : 'pointer',
                        border: 'none',
                        backgroundColor: ft.active ? 'var(--badge-success-bg)' : 'var(--navy-soft, #f0f1f5)',
                        color: ft.active ? 'var(--badge-success-text)' : 'var(--muted, #6b7280)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {togglingId === ft.id ? '...' : ft.active ? 'Actif' : 'Inactif'}
                    </button>
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(ft)}
                        style={{
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 500,
                          backgroundColor: 'var(--paper, #ffffff)',
                          border: '1px solid var(--line, #dfe2e2)',
                          borderRadius: 'var(--r-field, 4px)',
                          color: 'var(--navy-text, #25324f)',
                          cursor: 'pointer',
                        }}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === ft.id}
                        onClick={() => handleDelete(ft)}
                        style={{
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 500,
                          backgroundColor: 'var(--paper, #ffffff)',
                          border: '1px solid var(--badge-danger-border)',
                          borderRadius: 'var(--r-field, 4px)',
                          color: 'var(--navy-text, #f61b39)',
                          cursor: deletingId === ft.id ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {deletingId === ft.id ? '...' : 'Supprimer'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      <FaultTypeModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleModalSuccess}
        mode={modalMode}
        initialCategoryId={selectedCategoryId || null}
        categoriesList={flatCategories}
        faultTypeToEdit={faultTypeToEdit}
      />
    </div>
  );
}
