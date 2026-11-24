'use client';

import { useCallback, useEffect, useState, type HTMLAttributes } from 'react';
import type { AdminCategoryTreeItem } from '@revime/shared';
import { CategoryModal } from './CategoryModal';
import { dropMove, moveAndRenumber } from '../../lib/category-drag';
import { categorySavedMessage } from '../../lib/category-feedback';

/** Drag-and-drop handlers of one row, for the sibling group `list` it belongs to. */
type RowDrag = (list: AdminCategoryTreeItem[], id: string) => HTMLAttributes<HTMLTableRowElement>;

export interface CategoryTaxonomyViewProps {
  onRefreshOverview?: () => void;
  refreshSignal?: number;
  initialCategories?: AdminCategoryTreeItem[];
  initialActionSuccess?: string | null;
}

export function CategoryTaxonomyView({
  onRefreshOverview,
  refreshSignal,
  initialCategories,
  initialActionSuccess = null,
}: CategoryTaxonomyViewProps) {
  const [categories, setCategories] = useState<AdminCategoryTreeItem[]>(initialCategories ?? []);
  const [loading, setLoading] = useState(!initialCategories);
  const [error, setError] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');

  // Expanded root category IDs
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set((initialCategories ?? []).map((c) => c.id))
  );

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [modalCategoryToEdit, setModalCategoryToEdit] = useState<AdminCategoryTreeItem | null>(null);
  const [modalInitialParentId, setModalInitialParentId] = useState<string | null>(null);

  // Toggling loading state per category ID
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(initialActionSuccess);
  const [deactivatingCategory, setDeactivatingCategory] = useState<AdminCategoryTreeItem | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/proxy/admin/catalog/categories');
      if (!res.ok) {
        setError('Impossible de charger la taxonomie des catégories.');
        setLoading(false);
        return;
      }
      const data = (await res.json()) as AdminCategoryTreeItem[];
      setCategories(data);

      // Expand all root categories by default on first load
      setExpandedIds((prev) => {
        if (prev.size === 0 && data.length > 0) {
          return new Set(data.map((c) => c.id));
        }
        return prev;
      });
      setLoading(false);
    } catch {
      setError('Erreur réseau lors du chargement des catégories.');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialCategories || refreshSignal !== undefined) {
      void fetchCategories();
    }
  }, [fetchCategories, refreshSignal, initialCategories]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(new Set(categories.map((c) => c.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  const handleAddSubCategory = (parent: AdminCategoryTreeItem) => {
    setModalMode('create');
    setModalInitialParentId(parent.id);
    setModalCategoryToEdit(null);
    setModalOpen(true);
  };

  const handleEdit = (cat: AdminCategoryTreeItem) => {
    setModalMode('edit');
    setModalCategoryToEdit(cat);
    setModalInitialParentId(cat.parentId ?? null);
    setModalOpen(true);
  };

  const isFiltered = Boolean(filterQuery.trim());

  const handleReorder = async (categoryList: AdminCategoryTreeItem[], fromIndex: number, toIndex: number) => {
    if (isFiltered) return; // Prevent reordering when search filter is active
    if (toIndex < 0 || toIndex >= categoryList.length) return;
    setIsReordering(true);
    const moved = categoryList[fromIndex]!;
    const renumbered = moveAndRenumber(categoryList, fromIndex, toIndex);

    // Optimistically update
    if (!moved.parentId) {
      setCategories(renumbered);
    } else {
      setCategories((prev) =>
        prev.map((root) => {
          if (root.id === moved.parentId) {
            return { ...root, children: renumbered };
          }
          return root;
        })
      );
    }

    try {
      const res = await fetch('/api/proxy/admin/catalog/categories/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryIds: renumbered.map((c) => c.id) }),
      });
      if (!res.ok) {
        setActionError('Erreur lors de la réorganisation des catégories.');
        void fetchCategories();
      }
    } catch {
      setActionError('Erreur réseau lors de la réorganisation.');
      void fetchCategories();
    } finally {
      setIsReordering(false);
    }
  };

  const rowDrag: RowDrag = (list, id) => {
    const enabled = !isFiltered && !isReordering;
    return {
      draggable: enabled,
      onDragStart: (e) => {
        if (!enabled) return;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
        setDraggedId(id);
      },
      onDragOver: (e) => {
        // a row accepts a drop only from its own sibling group
        if (enabled && dropMove(list, draggedId, id)) e.preventDefault();
      },
      onDrop: (e) => {
        e.preventDefault();
        const move = dropMove(list, draggedId, id);
        setDraggedId(null);
        if (enabled && move) void handleReorder(list, move.from, move.to);
      },
      onDragEnd: () => setDraggedId(null),
    };
  };

  const executeToggleActive = async (cat: AdminCategoryTreeItem) => {
    const nextActive = !cat.active;
    setTogglingId(cat.id);
    setActionError(null);

    // Optimistic update: cascade deactivation to children if parent is deactivated
    setCategories((prev) =>
      prev.map((root) => {
        if (root.id === cat.id) {
          const children = !nextActive && !cat.parentId
            ? root.children.map((sub) => ({ ...sub, active: false }))
            : root.children;
          return { ...root, active: nextActive, children };
        }
        return {
          ...root,
          children: root.children.map((sub) => (sub.id === cat.id ? { ...sub, active: nextActive } : sub)),
        };
      })
    );

    try {
      const res = await fetch(`/api/proxy/admin/catalog/categories/${encodeURIComponent(cat.id)}/active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextActive }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setActionError(body?.message || 'Erreur lors du changement de statut de la catégorie.');
        void fetchCategories();
      } else {
        const updated = (await res.json()) as AdminCategoryTreeItem;
        if (!cat.parentId && !nextActive) {
          void fetchCategories();
        } else {
          setCategories((prev) =>
            prev.map((root) => {
              if (root.id === cat.id) {
                return { ...root, ...updated, children: root.children };
              }
              return {
                ...root,
                children: root.children.map((sub) => (sub.id === cat.id ? { ...sub, ...updated } : sub)),
              };
            })
          );
        }
        onRefreshOverview?.();
      }
    } catch {
      setActionError('Erreur réseau. Impossible de modifier le statut.');
      void fetchCategories();
    } finally {
      setTogglingId(null);
    }
  };

  const handleToggleActive = (cat: AdminCategoryTreeItem) => {
    if (cat.active && !cat.parentId && cat.children.length > 0) {
      setDeactivatingCategory(cat);
      return;
    }
    void executeToggleActive(cat);
  };

  // Filter logic
  const query = filterQuery.trim().toLowerCase();
  const filteredCategories = categories.filter((root) => {
    if (!query) return true;
    const rootMatches =
      root.labelFr.toLowerCase().includes(query) || root.slug.toLowerCase().includes(query);
    const childMatches = root.children.some(
      (sub) => sub.labelFr.toLowerCase().includes(query) || sub.slug.toLowerCase().includes(query)
    );
    return rootMatches || childMatches;
  });

  const rootOptions = categories.map((c) => ({ id: c.id, labelFr: c.labelFr }));

  return (
    <div>
      {/* Top Filter & Expand Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 280px', maxWidth: '380px' }}>
          <input
            type="text"
            placeholder="Rechercher par nom ou slug…"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            style={{
              padding: '8px 12px',
              fontSize: '13px',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
              backgroundColor: 'var(--paper)',
              width: '100%',
            }}
          />
          {filterQuery && (
            <button
              type="button"
              onClick={() => setFilterQuery('')}
              style={{
                padding: '6px 10px',
                fontSize: '12px',
                background: 'var(--paper)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-field, 4px)',
                color: 'var(--muted, #6b7280)',
                cursor: 'pointer',
              }}
            >
              Effacer
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={expandAll}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 500,
              backgroundColor: 'var(--paper)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
              color: 'var(--ink, #141414)',
              cursor: 'pointer',
            }}
          >
            Tout déplier
          </button>
          <button
            type="button"
            onClick={collapseAll}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 500,
              backgroundColor: 'var(--paper)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
              color: 'var(--ink, #141414)',
              cursor: 'pointer',
            }}
          >
            Tout replier
          </button>
        </div>
      </div>

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

      {actionSuccess && (
        <div
          role="status"
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--badge-success-bg)',
            border: '1px solid var(--badge-success-border)',
            borderRadius: 'var(--r-field, 4px)',
            color: 'var(--badge-success-text)',
            fontSize: '13px',
            marginBottom: '16px',
          }}
        >
          {actionSuccess}
        </div>
      )}

      {loading && (
        <p style={{ color: 'var(--muted, #6b7280)', padding: '24px 0' }}>
          Chargement de la taxonomie des catégories…
        </p>
      )}

      {error && (
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
          {error}
        </div>
      )}

      {!loading && !error && filteredCategories.length === 0 && (
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
          {query ? 'Aucune catégorie ne correspond à votre recherche.' : 'Aucune catégorie configurée.'}
        </div>
      )}

      {!loading && !error && filteredCategories.length > 0 && (
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
                  Catégorie
                </th>
                <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 600, color: 'var(--muted, #6b7280)' }}>
                  Slug
                </th>
                <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 600, color: 'var(--muted, #6b7280)' }}>
                  Ordre
                </th>
                <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 600, color: 'var(--muted, #6b7280)' }}>
                  Demandes
                </th>
                <th style={{ padding: '12px 14px', fontSize: '12px', fontWeight: 600, color: 'var(--muted, #6b7280)' }}>
                  Réparateurs
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
              {filteredCategories.map((root, index) => {
                const isExpanded = expandedIds.has(root.id);
                const hasChildren = root.children.length > 0;
                const isToggling = togglingId === root.id;

                return (
                  <CategoryRowGroup
                    key={root.id}
                    root={root}
                    isExpanded={isExpanded}
                    hasChildren={hasChildren}
                    isToggling={isToggling}
                    togglingId={togglingId}
                    isFirst={index === 0}
                    isLast={index === filteredCategories.length - 1}
                    isFiltered={isFiltered}
                    isReordering={isReordering}
                    onMoveUp={() => void handleReorder(categories, categories.findIndex((c) => c.id === root.id), categories.findIndex((c) => c.id === root.id) - 1)}
                    onMoveDown={() => void handleReorder(categories, categories.findIndex((c) => c.id === root.id), categories.findIndex((c) => c.id === root.id) + 1)}
                    onToggleExpand={() => toggleExpand(root.id)}
                    onAddSubCategory={() => handleAddSubCategory(root)}
                    onEdit={() => handleEdit(root)}
                    onToggleActive={() => handleToggleActive(root)}
                    onEditSub={(sub) => handleEdit(sub)}
                    onToggleActiveSub={(sub) => handleToggleActive(sub)}
                    onReorderSub={(fromSubIdx, toSubIdx) => void handleReorder(root.children, fromSubIdx, toSubIdx)}
                    rowDrag={rowDrag}
                    allRoots={categories}
                    draggedId={draggedId}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation dialog for cascade disable */}
      {deactivatingCategory && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cascade-disable-title"
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
            zIndex: 1100,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--paper, #ffffff)',
              borderRadius: 'var(--r-card, 8px)',
              border: '1px solid var(--line, #dfe2e2)',
              maxWidth: '480px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
            }}
          >
            <h3
              id="cascade-disable-title"
              style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600, color: 'var(--ink, #141414)' }}
            >
              Confirmation de désactivation
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: 'var(--ink, #141414)', lineHeight: 1.5 }}>
              Désactiver cette catégorie principale désactivera également ses {deactivatingCategory.children.length}{' '}
              {deactivatingCategory.children.length === 1 ? 'sous-catégorie' : 'sous-catégories'}. Continuer ?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setDeactivatingCategory(null)}
                style={{
                  padding: '8px 14px',
                  fontSize: '13px',
                  fontWeight: 500,
                  backgroundColor: 'var(--paper, #ffffff)',
                  border: '1px solid var(--line, #dfe2e2)',
                  borderRadius: 'var(--r-field, 4px)',
                  color: 'var(--ink, #141414)',
                  cursor: 'pointer',
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  const cat = deactivatingCategory;
                  setDeactivatingCategory(null);
                  void executeToggleActive(cat);
                }}
                style={{
                  padding: '8px 14px',
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: 'var(--red-deep, #bd0e26)',
                  border: 'none',
                  borderRadius: 'var(--r-field, 4px)',
                  color: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                Confirmer la désactivation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for adding sub-category or editing */}
      <CategoryModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          setModalOpen(false);
          setActionSuccess(categorySavedMessage(modalMode));
          void fetchCategories();
          onRefreshOverview?.();
        }}
        mode={modalMode}
        categoryToEdit={modalCategoryToEdit}
        initialParentId={modalInitialParentId}
        rootCategories={rootOptions}
      />
    </div>
  );
}

interface CategoryRowGroupProps {
  root: AdminCategoryTreeItem;
  isExpanded: boolean;
  hasChildren: boolean;
  isToggling: boolean;
  togglingId: string | null;
  isFirst: boolean;
  isLast: boolean;
  isFiltered?: boolean;
  isReordering?: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleExpand: () => void;
  onAddSubCategory: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onEditSub: (sub: AdminCategoryTreeItem) => void;
  onToggleActiveSub: (sub: AdminCategoryTreeItem) => void;
  onReorderSub: (fromIndex: number, toIndex: number) => void;
  rowDrag: RowDrag;
  /** The complete root list: the sibling group of a root row. */
  allRoots: AdminCategoryTreeItem[];
  draggedId: string | null;
}

function CategoryRowGroup({
  root,
  isExpanded,
  hasChildren,
  isToggling,
  togglingId,
  isFirst,
  isLast,
  isFiltered = false,
  isReordering = false,
  onMoveUp,
  onMoveDown,
  onToggleExpand,
  onAddSubCategory,
  onEdit,
  onToggleActive,
  onEditSub,
  onToggleActiveSub,
  onReorderSub,
  rowDrag,
  allRoots,
  draggedId,
}: CategoryRowGroupProps) {
  return (
    <>
      {/* Root Category Row */}
      <tr
        data-testid={`category-row-${root.id}`}
        {...rowDrag(allRoots, root.id)}
        style={{
          borderBottom: '1px solid var(--line, #dfe2e2)',
          backgroundColor: 'var(--paper)',
          transition: 'background-color 0.1s ease',
          opacity: draggedId === root.id ? 0.5 : 1,
        }}
      >
        {/* Catégorie */}
        <td style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {hasChildren ? (
              <button
                type="button"
                onClick={onToggleExpand}
                aria-label={isExpanded ? 'Replier la catégorie' : 'Déplier la catégorie'}
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
            ) : (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  color: 'var(--muted, #6b7280)',
                  fontSize: '12px',
                }}
              >
                •
              </span>
            )}
            {root.icon && (
              <span style={{ fontSize: '16px', lineHeight: 1 }} aria-hidden="true">
                {root.icon}
              </span>
            )}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink, #141414)' }}>
                  {root.labelFr}
                </span>
                {hasChildren && (
                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--muted, #6b7280)',
                      backgroundColor: 'var(--badge-neutral-bg)',
                      padding: '1px 6px',
                      borderRadius: '10px',
                    }}
                  >
                    {root.children.length} {root.children.length === 1 ? 'sous-catégorie' : 'sous-catégories'}
                  </span>
                )}
                {hasChildren && (
                  <span
                    data-testid="aggregated-counters-badge"
                    style={{
                      fontSize: '11px',
                      color: 'var(--navy-text, #25324f)',
                      backgroundColor: 'var(--badge-neutral-bg)',
                      padding: '1px 6px',
                      borderRadius: '10px',
                      fontWeight: 500,
                    }}
                  >
                    Cumulé : {root.demandesCount} dem. / {root.repairersCount} rép.
                  </span>
                )}
              </div>
              {root.description && (
                <div style={{ fontSize: '11px', color: 'var(--muted, #6b7280)', marginTop: '2px' }}>
                  {root.description}
                </div>
              )}
            </div>
          </div>
        </td>

        {/* Slug */}
        <td style={{ padding: '12px 14px' }}>
          <code
            style={{
              fontSize: '12px',
              fontFamily: 'monospace',
              padding: '2px 6px',
              backgroundColor: 'var(--badge-neutral-bg)',
              borderRadius: '4px',
              border: '1px solid var(--line, #dfe2e2)',
              color: 'var(--ink, #141414)',
            }}
          >
            {root.slug}
          </code>
        </td>

        {/* Ordre */}
        <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
          {root.sortOrder}
        </td>

        {/* Demandes */}
        <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--ink, #141414)' }}>
          {root.demandesCount}
        </td>

        {/* Réparateurs */}
        <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--ink, #141414)' }}>
          {root.repairersCount}
        </td>

        {/* Statut */}
        <td style={{ padding: '12px 14px' }}>
          {root.active ? (
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
          <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
            <button
              type="button"
              disabled={isFirst || isFiltered || isReordering}
              onClick={onMoveUp}
              aria-label="Monter la catégorie"
              title={
                isFiltered
                  ? 'La réorganisation est désactivée pendant une recherche'
                  : isFirst
                    ? 'Premier élément'
                    : 'Monter'
              }
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                lineHeight: 1,
                backgroundColor: 'var(--paper)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-field, 4px)',
                color: isFirst || isFiltered || isReordering ? 'var(--muted, #6b7280)' : 'var(--ink, #141414)',
                cursor: isFirst || isFiltered || isReordering ? 'not-allowed' : 'pointer',
                opacity: isFirst || isFiltered || isReordering ? 0.4 : 1,
              }}
            >
              ↑
            </button>
            <button
              type="button"
              disabled={isLast || isFiltered || isReordering}
              onClick={onMoveDown}
              aria-label="Descendre la catégorie"
              title={
                isFiltered
                  ? 'La réorganisation est désactivée pendant une recherche'
                  : isLast
                    ? 'Dernier élément'
                    : 'Descendre'
              }
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                lineHeight: 1,
                backgroundColor: 'var(--paper)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-field, 4px)',
                color: isLast || isFiltered || isReordering ? 'var(--muted, #6b7280)' : 'var(--ink, #141414)',
                cursor: isLast || isFiltered || isReordering ? 'not-allowed' : 'pointer',
                opacity: isLast || isFiltered || isReordering ? 0.4 : 1,
              }}
            >
              ↓
            </button>
            <button
              type="button"
              onClick={onAddSubCategory}
              title="Ajouter une sous-catégorie sous cette catégorie"
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
              + Sous-catégorie
            </button>
            <button
              type="button"
              onClick={onEdit}
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
              disabled={isToggling}
              onClick={onToggleActive}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 500,
                backgroundColor: root.active ? 'var(--paper)' : 'var(--green-soft, #e7f8f0)',
                border: root.active ? '1px solid var(--line, #dfe2e2)' : '1px solid var(--badge-success-border)',
                borderRadius: 'var(--r-field, 4px)',
                color: root.active ? 'var(--red-text, #bd0e26)' : 'var(--green-deep, #0a8a50)',
                cursor: isToggling ? 'not-allowed' : 'pointer',
                opacity: isToggling ? 0.6 : 1,
              }}
            >
              {isToggling ? '…' : root.active ? 'Désactiver' : 'Activer'}
            </button>
          </div>
        </td>
      </tr>

      {/* Child Subcategory Rows (when expanded) */}
      {isExpanded &&
        root.children.map((sub, subIdx) => {
          const isSubToggling = togglingId === sub.id;
          const isSubFirst = subIdx === 0;
          const isSubLast = subIdx === root.children.length - 1;
          return (
            <tr
              key={sub.id}
              data-testid={`category-row-${sub.id}`}
              {...rowDrag(root.children, sub.id)}
              style={{
                borderBottom: '1px solid var(--line, #dfe2e2)',
                backgroundColor: 'var(--badge-neutral-bg)',
                opacity: draggedId === sub.id ? 0.5 : 1,
              }}
            >
              {/* Catégorie (Indented) */}
              <td style={{ padding: '10px 16px 10px 48px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: 'var(--muted, #6b7280)', fontSize: '13px', userSelect: 'none' }}>
                    ↳
                  </span>
                  {sub.icon && (
                    <span style={{ fontSize: '14px', lineHeight: 1 }} aria-hidden="true">
                      {sub.icon}
                    </span>
                  )}
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--ink, #141414)' }}>
                      {sub.labelFr}
                    </span>
                    {sub.description && (
                      <div style={{ fontSize: '11px', color: 'var(--muted, #6b7280)', marginTop: '2px' }}>
                        {sub.description}
                      </div>
                    )}
                  </div>
                </div>
              </td>

              {/* Slug */}
              <td style={{ padding: '10px 14px' }}>
                <code
                  style={{
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    padding: '2px 5px',
                    backgroundColor: 'var(--badge-neutral-bg)',
                    borderRadius: '4px',
                    border: '1px solid var(--line, #dfe2e2)',
                    color: 'var(--ink, #141414)',
                  }}
                >
                  {sub.slug}
                </code>
              </td>

              {/* Ordre */}
              <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--muted, #6b7280)' }}>
                {sub.sortOrder}
              </td>

              {/* Demandes */}
              <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--ink, #141414)' }}>
                {sub.demandesCount}
              </td>

              {/* Réparateurs */}
              <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--ink, #141414)' }}>
                {sub.repairersCount}
              </td>

              {/* Statut */}
              <td style={{ padding: '10px 14px' }}>
                {sub.active ? (
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
                    Active
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
                    Désactivée
                  </span>
                )}
              </td>

              {/* Actions */}
              <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                  <button
                    type="button"
                    disabled={isSubFirst || isFiltered || isReordering}
                    onClick={() => onReorderSub(subIdx, subIdx - 1)}
                    aria-label="Monter la sous-catégorie"
                    title={
                      isFiltered
                        ? 'La réorganisation est désactivée pendant une recherche'
                        : isSubFirst
                          ? 'Premier élément'
                          : 'Monter'
                    }
                    style={{
                      padding: '3px 6px',
                      fontSize: '11px',
                      lineHeight: 1,
                      backgroundColor: 'var(--paper)',
                      border: '1px solid var(--line, #dfe2e2)',
                      borderRadius: 'var(--r-field, 4px)',
                      color: isSubFirst || isFiltered || isReordering ? 'var(--muted, #6b7280)' : 'var(--ink, #141414)',
                      cursor: isSubFirst || isFiltered || isReordering ? 'not-allowed' : 'pointer',
                      opacity: isSubFirst || isFiltered || isReordering ? 0.4 : 1,
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={isSubLast || isFiltered || isReordering}
                    onClick={() => onReorderSub(subIdx, subIdx + 1)}
                    aria-label="Descendre la sous-catégorie"
                    title={
                      isFiltered
                        ? 'La réorganisation est désactivée pendant une recherche'
                        : isSubLast
                          ? 'Dernier élément'
                          : 'Descendre'
                    }
                    style={{
                      padding: '3px 6px',
                      fontSize: '11px',
                      lineHeight: 1,
                      backgroundColor: 'var(--paper)',
                      border: '1px solid var(--line, #dfe2e2)',
                      borderRadius: 'var(--r-field, 4px)',
                      color: isSubLast || isFiltered || isReordering ? 'var(--muted, #6b7280)' : 'var(--ink, #141414)',
                      cursor: isSubLast || isFiltered || isReordering ? 'not-allowed' : 'pointer',
                      opacity: isSubLast || isFiltered || isReordering ? 0.4 : 1,
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditSub(sub)}
                    style={{
                      padding: '3px 8px',
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
                    disabled={isSubToggling}
                    onClick={() => onToggleActiveSub(sub)}
                    style={{
                      padding: '3px 8px',
                      fontSize: '12px',
                      fontWeight: 500,
                      backgroundColor: sub.active ? 'var(--paper)' : 'var(--green-soft, #e7f8f0)',
                      border: sub.active ? '1px solid var(--line, #dfe2e2)' : '1px solid var(--badge-success-border)',
                      borderRadius: 'var(--r-field, 4px)',
                      color: sub.active ? 'var(--red-text, #bd0e26)' : 'var(--green-deep, #0a8a50)',
                      cursor: isSubToggling ? 'not-allowed' : 'pointer',
                      opacity: isSubToggling ? 0.6 : 1,
                    }}
                  >
                    {isSubToggling ? '…' : sub.active ? 'Désactiver' : 'Activer'}
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
    </>
  );
}
