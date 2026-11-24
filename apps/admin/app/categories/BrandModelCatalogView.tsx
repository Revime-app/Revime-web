'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AdminBrandListItem,
  AdminBrandListResponse,
  AdminCategoryTreeItem,
  AdminDeviceModelListItem,
  AdminDeviceModelListResponse,
} from '@revime/shared';
import { BrandModal } from './BrandModal';
import { ModelModal } from './ModelModal';

export interface BrandModelCatalogViewProps {
  onRefreshOverview?: () => void;
  createBrandSignal?: number;
  createModelSignal?: number;
}

interface ModelsState {
  loading: boolean;
  error: string | null;
  items: AdminDeviceModelListItem[];
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

export function BrandModelCatalogView({
  onRefreshOverview,
  createBrandSignal,
  createModelSignal,
}: BrandModelCatalogViewProps) {
  // Filter bar state
  const [filterDraft, setFilterDraft] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'true' | 'false'>('ALL');

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);

  // Brands data state
  const [brands, setBrands] = useState<AdminBrandListItem[]>([]);
  const [allBrandsList, setAllBrandsList] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [brandsError, setBrandsError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Categories list state
  const [flatCategories, setFlatCategories] = useState<Array<{ id: string; labelFr: string }>>([]);

  // Expanded brands state
  const [expandedBrandIds, setExpandedBrandIds] = useState<Set<string>>(new Set());
  const [modelsByBrand, setModelsByBrand] = useState<Record<string, ModelsState>>({});

  // Modals state
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [brandModalMode, setBrandModalMode] = useState<'create' | 'edit'>('create');
  const [brandToEdit, setBrandToEdit] = useState<AdminBrandListItem | null>(null);

  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [modelModalMode, setModelModalMode] = useState<'create' | 'edit'>('create');
  const [modelToEdit, setModelToEdit] = useState<AdminDeviceModelListItem | null>(null);
  const [modelInitialBrandId, setModelInitialBrandId] = useState<string | null>(null);

  // Debounce search query 250ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilterQuery(filterDraft);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [filterDraft]);

  // Load categories
  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/admin/catalog/categories');
      if (res.ok) {
        const data = (await res.json()) as AdminCategoryTreeItem[];
        setFlatCategories(flattenCategories(data));
      }
    } catch {
      // Non-blocking fallback
    }
  }, []);

  // Fetch all brands (for ModelModal brand dropdown)
  const fetchAllBrandsList = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/admin/catalog/brands?pageSize=200');
      if (res.ok) {
        const data = (await res.json()) as AdminBrandListResponse;
        setAllBrandsList(data.items.map((b) => ({ id: b.id, name: b.name })));
      }
    } catch {
      // Non-blocking
    }
  }, []);

  // Fetch paginated brands
  const fetchBrands = useCallback(async () => {
    setLoadingBrands(true);
    setBrandsError(null);

    const params = new URLSearchParams();
    if (filterQuery.trim()) params.set('q', filterQuery.trim());
    if (selectedCategory) params.set('categoryId', selectedCategory);
    if (statusFilter !== 'ALL') params.set('active', statusFilter);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));

    try {
      const res = await fetch(`/api/proxy/admin/catalog/brands?${params.toString()}`);
      if (!res.ok) {
        setBrandsError('Impossible de charger la liste des marques.');
        setLoadingBrands(false);
        return;
      }
      const data = (await res.json()) as AdminBrandListResponse;
      setBrands(data.items);
      setTotal(data.total);
      setLoadingBrands(false);
    } catch {
      setBrandsError('Erreur réseau lors du chargement des marques.');
      setLoadingBrands(false);
    }
  }, [filterQuery, selectedCategory, statusFilter, page, pageSize]);

  // Fetch models for a specific brand
  const fetchModelsForBrand = useCallback(async (brandId: string) => {
    setModelsByBrand((prev) => ({
      ...prev,
      [brandId]: { loading: true, error: null, items: prev[brandId]?.items || [] },
    }));

    try {
      const res = await fetch(`/api/proxy/admin/catalog/models?brandId=${encodeURIComponent(brandId)}&pageSize=100`);
      if (!res.ok) {
        setModelsByBrand((prev) => ({
          ...prev,
          [brandId]: { loading: false, error: 'Impossible de charger les modèles de cette marque.', items: [] },
        }));
        return;
      }
      const data = (await res.json()) as AdminDeviceModelListResponse;
      setModelsByBrand((prev) => ({
        ...prev,
        [brandId]: { loading: false, error: null, items: data.items },
      }));
    } catch {
      setModelsByBrand((prev) => ({
        ...prev,
        [brandId]: { loading: false, error: 'Erreur réseau lors du chargement des modèles.', items: [] },
      }));
    }
  }, []);

  // Initial loads
  useEffect(() => {
    void fetchCategories();
    void fetchAllBrandsList();
  }, [fetchCategories, fetchAllBrandsList]);

  // Fetch brands when params change
  useEffect(() => {
    void fetchBrands();
  }, [fetchBrands]);

  // Handle external signals from parent header buttons
  const prevBrandSignalRef = useRef(createBrandSignal);
  useEffect(() => {
    if (createBrandSignal !== undefined && createBrandSignal !== prevBrandSignalRef.current) {
      prevBrandSignalRef.current = createBrandSignal;
      handleOpenCreateBrand();
    }
  }, [createBrandSignal]);

  const prevModelSignalRef = useRef(createModelSignal);
  useEffect(() => {
    if (createModelSignal !== undefined && createModelSignal !== prevModelSignalRef.current) {
      prevModelSignalRef.current = createModelSignal;
      handleOpenCreateModel();
    }
  }, [createModelSignal]);

  // Toggle brand expansion
  const toggleBrandExpand = (brandId: string) => {
    setExpandedBrandIds((prev) => {
      const next = new Set(prev);
      if (next.has(brandId)) {
        next.delete(brandId);
      } else {
        next.add(brandId);
        // Load models if not already loaded
        void fetchModelsForBrand(brandId);
      }
      return next;
    });
  };

  // Open modals
  const handleOpenCreateBrand = () => {
    setBrandModalMode('create');
    setBrandToEdit(null);
    setBrandModalOpen(true);
  };

  const handleOpenEditBrand = (brand: AdminBrandListItem) => {
    setBrandModalMode('edit');
    setBrandToEdit(brand);
    setBrandModalOpen(true);
  };

  const handleOpenCreateModel = (brandId?: string) => {
    setModelModalMode('create');
    setModelToEdit(null);
    setModelInitialBrandId(brandId || null);
    setModelModalOpen(true);
  };

  const handleOpenEditModel = (model: AdminDeviceModelListItem) => {
    setModelModalMode('edit');
    setModelToEdit(model);
    setModelInitialBrandId(model.brandId);
    setModelModalOpen(true);
  };

  // Delete brand
  const handleDeleteBrand = async (brand: AdminBrandListItem) => {
    const confirmMessage = `Êtes-vous sûr de vouloir supprimer la marque "${brand.name}" ? Tous les modèles associés seront également supprimés.`;
    if (!window.confirm(confirmMessage)) return;

    setActionError(null);
    try {
      const res = await fetch(`/api/proxy/admin/catalog/brands/${encodeURIComponent(brand.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setActionError(body?.message || 'Erreur lors de la suppression de la marque.');
        return;
      }
      // Success
      void fetchBrands();
      void fetchAllBrandsList();
      onRefreshOverview?.();
    } catch {
      setActionError('Erreur réseau. Impossible de supprimer la marque.');
    }
  };

  // Delete model
  const handleDeleteModel = async (model: AdminDeviceModelListItem) => {
    const confirmMessage = `Êtes-vous sûr de vouloir supprimer le modèle "${model.name}" ?`;
    if (!window.confirm(confirmMessage)) return;

    setActionError(null);
    try {
      const res = await fetch(`/api/proxy/admin/catalog/models/${encodeURIComponent(model.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setActionError(body?.message || 'Erreur lors de la suppression du modèle.');
        return;
      }
      // Success: reload models for this brand & refresh brands table (for modelsCount)
      void fetchModelsForBrand(model.brandId);
      void fetchBrands();
      onRefreshOverview?.();
    } catch {
      setActionError('Erreur réseau. Impossible de supprimer le modèle.');
    }
  };

  // Refresh handlers after modal operations
  const handleBrandModalSuccess = () => {
    void fetchBrands();
    void fetchAllBrandsList();
    onRefreshOverview?.();
  };

  const handleModelModalSuccess = () => {
    void fetchBrands();
    // If any expanded brands, refresh their models
    expandedBrandIds.forEach((bId) => {
      void fetchModelsForBrand(bId);
    });
    onRefreshOverview?.();
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      {/* Filter Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          padding: '14px 16px',
          backgroundColor: 'var(--paper, #ffffff)',
          borderRadius: 'var(--r-card, 8px)',
          border: '1px solid var(--line, #dfe2e2)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', flex: '1 1 500px' }}>
          {/* Search Input */}
          <div style={{ position: 'relative', minWidth: '220px', flex: '1 1 220px' }}>
            <input
              type="text"
              placeholder="Rechercher marque ou slug..."
              value={filterDraft}
              onChange={(e) => setFilterDraft(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '13px',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-field, 4px)',
                backgroundColor: 'var(--paper)',
                boxSizing: 'border-box',
              }}
            />
            {filterDraft && (
              <button
                type="button"
                onClick={() => setFilterDraft('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: '2px 6px',
                  fontSize: '11px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--muted, #6b7280)',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Filter */}
          <div style={{ minWidth: '180px' }}>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(1);
              }}
              aria-label="Filtrer par catégorie"
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '13px',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-field, 4px)',
                backgroundColor: 'var(--paper)',
                boxSizing: 'border-box',
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

          {/* Status Filter */}
          <div style={{ minWidth: '130px' }}>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'ALL' | 'true' | 'false');
                setPage(1);
              }}
              aria-label="Filtrer par statut"
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '13px',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-field, 4px)',
                backgroundColor: 'var(--paper)',
                boxSizing: 'border-box',
              }}
            >
              <option value="ALL">Tous les statuts</option>
              <option value="true">Actives</option>
              <option value="false">Désactivées</option>
            </select>
          </div>
        </div>

        {/* Action Buttons in Filter Bar */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleOpenCreateBrand}
            style={{
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: 'var(--accent, #141414)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--r-field, 4px)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            + Nouvelle marque
          </button>
          <button
            type="button"
            onClick={() => handleOpenCreateModel()}
            style={{
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: 'var(--paper)',
              color: 'var(--ink, #141414)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            + Nouveau modèle
          </button>
        </div>
      </div>

      {/* Global Action Error alert */}
      {actionError && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--red-soft, #feedf0)',
            border: '1px solid var(--badge-danger-border)',
            borderRadius: 'var(--r-field, 4px)',
            color: 'var(--red-text, #bd0e26)',
            fontSize: '13px',
            marginBottom: '16px',
          }}
        >
          {actionError}
        </div>
      )}

      {/* Loading state */}
      {loadingBrands && (
        <p style={{ color: 'var(--muted, #6b7280)', padding: '24px 0' }}>
          Chargement des marques & modèles…
        </p>
      )}

      {/* Error state */}
      {brandsError && (
        <div
          role="alert"
          style={{
            color: 'var(--red-text, #bd0e26)',
            backgroundColor: 'var(--red-soft, #feedf0)',
            padding: '12px 16px',
            borderRadius: 'var(--r-field, 4px)',
            marginBottom: '16px',
          }}
        >
          {brandsError}
        </div>
      )}

      {/* Empty state */}
      {!loadingBrands && !brandsError && brands.length === 0 && (
        <div
          style={{
            padding: '40px 16px',
            textAlign: 'center',
            backgroundColor: 'var(--paper, #ffffff)',
            borderRadius: 'var(--r-card, 8px)',
            border: '1px solid var(--line, #dfe2e2)',
            color: 'var(--muted, #6b7280)',
          }}
        >
          {filterDraft || selectedCategory || statusFilter !== 'ALL'
            ? 'Aucune marque ne correspond à vos critères de recherche.'
            : 'Aucune marque référencée dans le catalogue.'}
        </div>
      )}

      {/* Brands Table */}
      {!loadingBrands && !brandsError && brands.length > 0 && (
        <div
          style={{
            backgroundColor: 'var(--paper, #ffffff)',
            borderRadius: 'var(--r-card, 8px)',
            border: '1px solid var(--line, #dfe2e2)',
            overflowX: 'auto',
          }}
        >
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--badge-neutral-bg)', borderBottom: '1px solid var(--line, #dfe2e2)' }}>
                <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--muted, #6b7280)' }}>
                  Marque
                </th>
                <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 600, color: 'var(--muted, #6b7280)' }}>
                  Catégories associées
                </th>
                <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 600, color: 'var(--muted, #6b7280)' }}>
                  Modèles
                </th>
                <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 600, color: 'var(--muted, #6b7280)' }}>
                  Ordre
                </th>
                <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 600, color: 'var(--muted, #6b7280)' }}>
                  Statut
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--muted, #6b7280)',
                    textAlign: 'right',
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {brands.map((brand) => {
                const isExpanded = expandedBrandIds.has(brand.id);
                const modelsData = modelsByBrand[brand.id];

                return (
                  <BrandRowGroup
                    key={brand.id}
                    brand={brand}
                    isExpanded={isExpanded}
                    modelsData={modelsData}
                    onToggleExpand={() => toggleBrandExpand(brand.id)}
                    onAddModel={() => handleOpenCreateModel(brand.id)}
                    onEditBrand={() => handleOpenEditBrand(brand)}
                    onDeleteBrand={() => handleDeleteBrand(brand)}
                    onEditModel={handleOpenEditModel}
                    onDeleteModel={handleDeleteModel}
                  />
                );
              })}
            </tbody>
          </table>

          {/* Pagination Controls */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              padding: '14px 16px',
              borderTop: '1px solid var(--line, #dfe2e2)',
              backgroundColor: 'var(--badge-neutral-bg)',
            }}
          >
            <div style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
              Page <strong>{page}</strong> sur <strong>{totalPages}</strong> ({total} {total === 1 ? 'marque' : 'marques'})
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                aria-label="Nombre d'éléments par page"
                style={{
                  padding: '5px 10px',
                  fontSize: '12px',
                  border: '1px solid var(--line, #dfe2e2)',
                  borderRadius: 'var(--r-field, 4px)',
                  backgroundColor: 'var(--paper)',
                }}
              >
                <option value={10}>10 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>

              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  backgroundColor: 'var(--paper)',
                  border: '1px solid var(--line, #dfe2e2)',
                  borderRadius: 'var(--r-field, 4px)',
                  color: page <= 1 ? 'var(--muted, #6b7280)' : 'var(--ink, #141414)',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                  opacity: page <= 1 ? 0.6 : 1,
                }}
              >
                Précédent
              </button>

              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  backgroundColor: 'var(--paper)',
                  border: '1px solid var(--line, #dfe2e2)',
                  borderRadius: 'var(--r-field, 4px)',
                  color: page >= totalPages ? 'var(--muted, #6b7280)' : 'var(--ink, #141414)',
                  cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                  opacity: page >= totalPages ? 0.6 : 1,
                }}
              >
                Suivant
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Brand Modal */}
      <BrandModal
        isOpen={brandModalOpen}
        onClose={() => setBrandModalOpen(false)}
        onSuccess={handleBrandModalSuccess}
        mode={brandModalMode}
        brandToEdit={brandToEdit}
        categories={flatCategories}
      />

      {/* Model Modal */}
      <ModelModal
        isOpen={modelModalOpen}
        onClose={() => setModelModalOpen(false)}
        onSuccess={handleModelModalSuccess}
        mode={modelModalMode}
        modelToEdit={modelToEdit}
        initialBrandId={modelInitialBrandId}
        brands={allBrandsList.length > 0 ? allBrandsList : brands.map((b) => ({ id: b.id, name: b.name }))}
        categories={flatCategories}
      />
    </div>
  );
}

interface BrandRowGroupProps {
  brand: AdminBrandListItem;
  isExpanded: boolean;
  modelsData?: ModelsState;
  onToggleExpand: () => void;
  onAddModel: () => void;
  onEditBrand: () => void;
  onDeleteBrand: () => void;
  onEditModel: (model: AdminDeviceModelListItem) => void;
  onDeleteModel: (model: AdminDeviceModelListItem) => void;
}

function BrandRowGroup({
  brand,
  isExpanded,
  modelsData,
  onToggleExpand,
  onAddModel,
  onEditBrand,
  onDeleteBrand,
  onEditModel,
  onDeleteModel,
}: BrandRowGroupProps) {
  return (
    <>
      <tr
        style={{
          borderBottom: isExpanded ? 'none' : '1px solid var(--line, #dfe2e2)',
          backgroundColor: isExpanded ? 'var(--badge-neutral-bg)' : 'var(--paper)',
          transition: 'background-color 0.1s ease',
        }}
      >
        {/* Marque (nom + slug) */}
        <td style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={onToggleExpand}
              aria-label={isExpanded ? 'Replier les modèles' : 'Voir les modèles'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                padding: 0,
                fontSize: '11px',
                lineHeight: 1,
                backgroundColor: 'var(--badge-neutral-bg)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: '4px',
                color: 'var(--ink, #141414)',
                cursor: 'pointer',
              }}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
            <div>
              <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink, #141414)', display: 'block' }}>
                {brand.name}
              </span>
              <code
                style={{
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: 'var(--muted, #6b7280)',
                }}
              >
                {brand.slug}
              </code>
            </div>
          </div>
        </td>

        {/* Catégories associées */}
        <td style={{ padding: '12px 14px' }}>
          {brand.categories.length === 0 ? (
            <span
              style={{
                fontSize: '12px',
                color: 'var(--muted, #6b7280)',
                fontStyle: 'italic',
              }}
            >
              Toutes catégories
            </span>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {brand.categories.map((c) => (
                <span
                  key={c.id}
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    fontSize: '11px',
                    fontWeight: 500,
                    backgroundColor: 'var(--badge-neutral-bg)',
                    color: 'var(--ink, #141414)',
                    borderRadius: '12px',
                    border: '1px solid var(--line, #dfe2e2)',
                  }}
                >
                  {c.labelFr}
                </span>
              ))}
            </div>
          )}
        </td>

        {/* Modèles count badge */}
        <td style={{ padding: '12px 14px' }}>
          <button
            type="button"
            onClick={onToggleExpand}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor: brand.modelsCount > 0 ? 'var(--badge-info-bg)' : 'var(--badge-neutral-bg)',
              color: brand.modelsCount > 0 ? 'var(--badge-info-text)' : 'var(--muted, #6b7280)',
              border: '1px solid',
              borderColor: brand.modelsCount > 0 ? 'var(--badge-info-border)' : 'var(--line, #dfe2e2)',
              borderRadius: '9999px',
              cursor: 'pointer',
            }}
          >
            {brand.modelsCount} {brand.modelsCount === 1 ? 'modèle' : 'modèles'}
          </button>
        </td>

        {/* Ordre */}
        <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
          {brand.sortOrder}
        </td>

        {/* Statut */}
        <td style={{ padding: '12px 14px' }}>
          {brand.active ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--green-deep, #0a8a50)',
                backgroundColor: 'var(--green-soft, #e7f8f0)',
                borderRadius: '9999px',
                border: '1px solid var(--badge-success-border)',
              }}
            >
              Active
            </span>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--muted, #6b7280)',
                backgroundColor: 'var(--badge-neutral-bg)',
                borderRadius: '9999px',
                border: '1px solid var(--line, #dfe2e2)',
              }}
            >
              Désactivée
            </span>
          )}
        </td>

        {/* Actions */}
        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
          <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={onToggleExpand}
              title="Déplier / replier la liste des modèles"
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 500,
                backgroundColor: 'var(--paper)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-field, 4px)',
                color: 'var(--ink, #141414)',
                cursor: 'pointer',
              }}
            >
              {isExpanded ? 'Masquer' : 'Voir modèles'}
            </button>
            <button
              type="button"
              onClick={onAddModel}
              title="Ajouter un modèle pour cette marque"
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 500,
                backgroundColor: 'var(--paper)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-field, 4px)',
                color: 'var(--ink, #141414)',
                cursor: 'pointer',
              }}
            >
              + Modèle
            </button>
            <button
              type="button"
              onClick={onEditBrand}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 500,
                backgroundColor: 'var(--paper)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-field, 4px)',
                color: 'var(--ink, #141414)',
                cursor: 'pointer',
              }}
            >
              Modifier
            </button>
            <button
              type="button"
              onClick={onDeleteBrand}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 500,
                backgroundColor: 'var(--red-soft, #feedf0)',
                border: '1px solid var(--badge-danger-border)',
                borderRadius: 'var(--r-field, 4px)',
                color: 'var(--red-text, #bd0e26)',
                cursor: 'pointer',
              }}
            >
              Supprimer
            </button>
          </div>
        </td>
      </tr>

      {/* Expandable Models List per Brand */}
      {isExpanded && (
        <tr style={{ backgroundColor: 'var(--badge-neutral-bg)', borderBottom: '1px solid var(--line, #dfe2e2)' }}>
          <td colSpan={6} style={{ padding: '16px 24px 20px 48px' }}>
            <div
              style={{
                backgroundColor: 'var(--paper)',
                borderRadius: '6px',
                border: '1px solid var(--line, #dfe2e2)',
                padding: '16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink, #141414)' }}>
                  Modèles de la marque {brand.name}
                </div>
                <button
                  type="button"
                  onClick={onAddModel}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    backgroundColor: 'var(--accent, #141414)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--r-field, 4px)',
                    cursor: 'pointer',
                  }}
                >
                  + Ajouter un modèle
                </button>
              </div>

              {modelsData?.loading && (
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted, #6b7280)', padding: '12px 0' }}>
                  Chargement des modèles de {brand.name}…
                </p>
              )}

              {modelsData?.error && (
                <div
                  role="alert"
                  style={{
                    fontSize: '12px',
                    color: 'var(--red-text, #bd0e26)',
                    backgroundColor: 'var(--red-soft, #feedf0)',
                    padding: '8px 12px',
                    borderRadius: '4px',
                  }}
                >
                  {modelsData.error}
                </div>
              )}

              {!modelsData?.loading && !modelsData?.error && (modelsData?.items.length ?? 0) === 0 && (
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted, #6b7280)', padding: '8px 0' }}>
                  Aucun modèle répertorié pour {brand.name}. Cliquez sur « + Ajouter un modèle » pour en créer un.
                </p>
              )}

              {!modelsData?.loading && !modelsData?.error && (modelsData?.items.length ?? 0) > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line, #dfe2e2)', color: 'var(--muted, #6b7280)' }}>
                      <th style={{ padding: '8px 10px', fontWeight: 600, fontSize: '11px' }}>Modèle</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600, fontSize: '11px' }}>Slug</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600, fontSize: '11px' }}>Catégorie spécifique</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600, fontSize: '11px' }}>Ordre</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600, fontSize: '11px' }}>Statut</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600, fontSize: '11px', textAlign: 'right' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelsData?.items.map((model) => (
                      <tr key={model.id} style={{ borderBottom: '1px solid var(--badge-neutral-bg)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 500, color: 'var(--ink, #141414)' }}>
                          {model.name}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <code
                            style={{
                              fontSize: '11px',
                              fontFamily: 'monospace',
                              backgroundColor: 'var(--badge-neutral-bg)',
                              padding: '2px 5px',
                              borderRadius: '4px',
                            }}
                          >
                            {model.slug}
                          </code>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          {model.categoryLabelFr ? (
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '1px 6px',
                                fontSize: '11px',
                                fontWeight: 500,
                                backgroundColor: 'var(--badge-success-bg)',
                                color: 'var(--badge-success-text)',
                                borderRadius: '4px',
                                border: '1px solid var(--badge-success-border)',
                              }}
                            >
                              {model.categoryLabelFr}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted, #6b7280)', fontSize: '12px' }}>
                              — Héritée
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--muted, #6b7280)', fontSize: '12px' }}>
                          {model.sortOrder}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          {model.active ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '1px 6px',
                                fontSize: '11px',
                                fontWeight: 600,
                                color: 'var(--green-deep, #0a8a50)',
                                backgroundColor: 'var(--green-soft, #e7f8f0)',
                                borderRadius: '9999px',
                                border: '1px solid var(--badge-success-border)',
                              }}
                            >
                              Actif
                            </span>
                          ) : (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '1px 6px',
                                fontSize: '11px',
                                fontWeight: 600,
                                color: 'var(--muted, #6b7280)',
                                backgroundColor: 'var(--badge-neutral-bg)',
                                borderRadius: '9999px',
                                border: '1px solid var(--line, #dfe2e2)',
                              }}
                            >
                              Désactivé
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                            <button
                              type="button"
                              onClick={() => onEditModel(model)}
                              style={{
                                padding: '3px 8px',
                                fontSize: '11px',
                                fontWeight: 500,
                                backgroundColor: 'var(--paper)',
                                border: '1px solid var(--line, #dfe2e2)',
                                borderRadius: 'var(--r-field, 4px)',
                                color: 'var(--ink, #141414)',
                                cursor: 'pointer',
                              }}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteModel(model)}
                              style={{
                                padding: '3px 8px',
                                fontSize: '11px',
                                fontWeight: 500,
                                backgroundColor: 'var(--red-soft, #feedf0)',
                                border: '1px solid var(--badge-danger-border)',
                                borderRadius: 'var(--r-field, 4px)',
                                color: 'var(--red-text, #bd0e26)',
                                cursor: 'pointer',
                              }}
                            >
                              Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
