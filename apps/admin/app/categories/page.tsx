'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminCatalogOverviewDto, AdminCategoryTreeItem } from '@revime/shared';
import { CategoryTaxonomyView } from './CategoryTaxonomyView';
import { CategoryModal } from './CategoryModal';
import { BrandModelCatalogView } from './BrandModelCatalogView';
import { FaultTypesCatalogView } from './FaultTypesCatalogView';
import { useAdminMe } from '../../components/AdminGate';
import { hasPermission } from '../../lib/permissions';

type OverviewState =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'loaded'; data: AdminCatalogOverviewDto };

type TabKey = 'taxonomy' | 'brands' | 'fault-types';

export default function CategoriesPage() {
  const [overview, setOverview] = useState<OverviewState>({ state: 'loading' });
  const [activeTab, setActiveTab] = useState<TabKey>('taxonomy');

  // Modal for top-level "Nouvelle catégorie" creation
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);

  // External trigger signals for Brand, Model & Fault Type modals
  const [createBrandSignal, setCreateBrandSignal] = useState(0);
  const [createModelSignal, setCreateModelSignal] = useState(0);
  const [createFaultTypeSignal, setCreateFaultTypeSignal] = useState(0);

  // CF4-40: display only - the API answers 403 to a role without the permission.
  const adminMe = useAdminMe();
  const canManage = hasPermission(adminMe, 'catalog.manage');

  // Root categories list for the creation modal
  const [rootCategories, setRootCategories] = useState<Array<{ id: string; labelFr: string }>>([]);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/admin/catalog/overview');
      if (!res.ok) {
        setOverview({ state: 'error', message: 'Impossible de charger les métriques du catalogue.' });
        return;
      }
      const data = (await res.json()) as AdminCatalogOverviewDto;
      setOverview({ state: 'loaded', data });
    } catch {
      setOverview({ state: 'error', message: 'Erreur réseau lors du chargement des indicateurs.' });
    }
  }, []);

  const fetchRootCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/admin/catalog/categories');
      if (res.ok) {
        const data = (await res.json()) as AdminCategoryTreeItem[];
        setRootCategories(data.map((c) => ({ id: c.id, labelFr: c.labelFr })));
      }
    } catch {
      // Ignored: modal fallback will show empty parent list
    }
  }, []);

  useEffect(() => {
    void fetchOverview();
    void fetchRootCategories();
  }, [fetchOverview, fetchRootCategories, refreshSignal]);

  const handleOpenCreateModal = () => {
    void fetchRootCategories();
    setIsCreateModalOpen(true);
  };

  const handleCreateSuccess = () => {
    setIsCreateModalOpen(false);
    setRefreshSignal((prev) => prev + 1);
    void fetchOverview();
    void fetchRootCategories();
  };

  return (
    <div className="page page--wide">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
          marginBottom: '24px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 6px 0' }}>Catégories & Catalogue</h1>
          <p style={{ margin: 0, color: 'var(--muted, #6b7280)', fontSize: '15px' }}>
            Gestion de la taxonomie des appareils, marques, modèles et types de panne
          </p>
        </div>

        {/* Action buttons */}
        <div>
          {activeTab === 'taxonomy' ? (
            <button
              hidden={!canManage}
              type="button"
              onClick={handleOpenCreateModal}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 18px',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: 'var(--navy, #25324f)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--r-field, 4px)',
                cursor: 'pointer',
                transition: 'opacity 0.15s ease',
              }}
            >
              + Nouvelle catégorie
            </button>
          ) : activeTab === 'brands' ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                hidden={!canManage}
                type="button"
                onClick={() => setCreateBrandSignal((prev) => prev + 1)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 18px',
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: 'var(--navy, #25324f)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--r-field, 4px)',
                  cursor: 'pointer',
                  transition: 'opacity 0.15s ease',
                }}
              >
                + Nouvelle marque
              </button>
              <button
                hidden={!canManage}
                type="button"
                onClick={() => setCreateModelSignal((prev) => prev + 1)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 18px',
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: 'var(--paper)',
                  color: 'var(--ink, #141414)',
                  border: '1px solid var(--line, #dfe2e2)',
                  borderRadius: 'var(--r-field, 4px)',
                  cursor: 'pointer',
                  transition: 'opacity 0.15s ease',
                }}
              >
                + Nouveau modèle
              </button>
            </div>
          ) : (
            <button
              hidden={!canManage}
              type="button"
              onClick={() => setCreateFaultTypeSignal((prev) => prev + 1)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 18px',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: 'var(--navy, #25324f)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--r-field, 4px)',
                cursor: 'pointer',
                transition: 'opacity 0.15s ease',
              }}
            >
              + Nouveau type de panne
            </button>
          )}
        </div>
      </div>

      {/* 5 KPI Stat Cards */}
      <div
        className="group__tiles"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '14px',
          marginBottom: '28px',
        }}
      >
        <div className="card kpi">
          <p className="kpi__label">Catégories principales</p>
          <p className="kpi__value">
            {overview.state === 'loaded' ? overview.data.totalRootCategories : '-'}
          </p>
          <p className="kpi__note">Niveau 1 de l&apos;arborescence</p>
        </div>

        <div className="card kpi">
          <p className="kpi__label">Sous-catégories</p>
          <p className="kpi__value">
            {overview.state === 'loaded' ? overview.data.totalSubCategories : '-'}
          </p>
          <p className="kpi__note">Spécificités et équipements</p>
        </div>

        <div className="card kpi">
          <p className="kpi__label">Marques référencées</p>
          <p className="kpi__value">
            {overview.state === 'loaded' ? overview.data.totalBrands : '-'}
          </p>
          <p className="kpi__note">Constructeurs répertoriés</p>
        </div>

        <div className="card kpi">
          <p className="kpi__label">Modèles répertoriés</p>
          <p className="kpi__value">
            {overview.state === 'loaded' ? overview.data.totalModels : '-'}
          </p>
          <p className="kpi__note">Appareils et déclinaisons</p>
        </div>

        <div className="card kpi">
          <p className="kpi__label">Types de panne</p>
          <p className="kpi__value">
            {overview.state === 'loaded' ? (overview.data.totalFaultTypes ?? '-') : '-'}
          </p>
          <p className="kpi__note">Anomalies et diagnostics</p>
        </div>
      </div>

      {overview.state === 'error' && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--red-soft, #feedf0)',
            border: '1px solid var(--badge-danger-border)',
            borderRadius: 'var(--r-field, 4px)',
            color: 'var(--red-text, #bd0e26)',
            fontSize: '13px',
            marginBottom: '20px',
          }}
        >
          {overview.message}
        </div>
      )}

      {/* Segmented Tab Switcher */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          borderBottom: '1px solid var(--line, #dfe2e2)',
          marginBottom: '24px',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('taxonomy')}
          style={{
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: 600,
            background: 'none',
            border: 'none',
            borderBottom:
              activeTab === 'taxonomy' ? '2px solid var(--navy, #25324f)' : '2px solid transparent',
            color: activeTab === 'taxonomy' ? 'var(--navy-text, #25324f)' : 'var(--muted, #6b7280)',
            cursor: 'pointer',
            borderRadius: 0,
            transition: 'all 0.15s ease',
          }}
        >
          Taxonomie des catégories
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('brands')}
          style={{
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: 600,
            background: 'none',
            border: 'none',
            borderBottom:
              activeTab === 'brands' ? '2px solid var(--navy, #25324f)' : '2px solid transparent',
            color: activeTab === 'brands' ? 'var(--navy-text, #25324f)' : 'var(--muted, #6b7280)',
            cursor: 'pointer',
            borderRadius: 0,
            transition: 'all 0.15s ease',
          }}
        >
          Marques & Modèles
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('fault-types')}
          style={{
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: 600,
            background: 'none',
            border: 'none',
            borderBottom:
              activeTab === 'fault-types' ? '2px solid var(--navy, #25324f)' : '2px solid transparent',
            color: activeTab === 'fault-types' ? 'var(--navy-text, #25324f)' : 'var(--muted, #6b7280)',
            cursor: 'pointer',
            borderRadius: 0,
            transition: 'all 0.15s ease',
          }}
        >
          Types de panne
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'taxonomy' ? (
        <CategoryTaxonomyView
          onRefreshOverview={() => {
            void fetchOverview();
            void fetchRootCategories();
          }}
          refreshSignal={refreshSignal}
        />
      ) : activeTab === 'brands' ? (
        <BrandModelCatalogView
          onRefreshOverview={() => {
            void fetchOverview();
          }}
          createBrandSignal={createBrandSignal}
          createModelSignal={createModelSignal}
        />
      ) : (
        <FaultTypesCatalogView
          onRefreshOverview={() => {
            void fetchOverview();
          }}
          createFaultTypeSignal={createFaultTypeSignal}
        />
      )}

      {/* Root Category Creation Modal */}
      <CategoryModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
        mode="create"
        initialParentId={null}
        rootCategories={rootCategories}
      />
    </div>
  );
}
