'use client';

import React from 'react';

export interface ListPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  noun?: string;
  pluralNoun?: string;
  pageSizeOptions?: number[];
  onPageChange: (newPage: number) => void;
  onPageSizeChange?: (newPageSize: number) => void;
  className?: string;
}

export function ListPagination({
  page,
  pageSize,
  total,
  noun = 'élément',
  pluralNoun,
  pageSizeOptions = [10, 25, 50, 100],
  onPageChange,
  onPageSizeChange,
  className,
}: ListPaginationProps) {
  const selectId = React.useId();
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const displayNoun = total > 1 ? (pluralNoun ?? `${noun}s`) : noun;

  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav
      aria-label="Pagination"
      className={className}
      data-testid="list-pagination"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '16px',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '8px 0',
      }}
    >
      {/* Total count and current page info */}
      <div
        data-testid="pagination-info"
        style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}
      >
        {total} {displayNoun} · Page {page} sur {totalPages}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        {/* Rows per page selector */}
        {onPageSizeChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
            <label htmlFor={selectId} style={{ margin: 0, whiteSpace: 'nowrap' }}>
              Afficher :
            </label>
            <select
              id={selectId}
              data-testid="rows-per-page-select"
              value={pageSize}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                if (newSize > 0) {
                  onPageSizeChange(newSize);
                }
              }}
              style={{
                padding: '4px 8px',
                fontSize: '13px',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-field, 4px)',
                backgroundColor: 'var(--paper, #ffffff)',
                color: 'var(--ink, #141414)',
                cursor: 'pointer',
              }}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} par page
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Previous / Next buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            data-testid="pagination-prev"
            disabled={!hasPrev}
            onClick={() => onPageChange(page - 1)}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 500,
              backgroundColor: !hasPrev ? 'var(--badge-neutral-bg)' : 'var(--paper, #ffffff)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
              color: !hasPrev ? 'var(--faint)' : 'var(--ink, #141414)',
              cursor: !hasPrev ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            Précédent
          </button>
          <button
            type="button"
            data-testid="pagination-next"
            disabled={!hasNext}
            onClick={() => onPageChange(page + 1)}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 500,
              backgroundColor: !hasNext ? 'var(--badge-neutral-bg)' : 'var(--paper, #ffffff)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
              color: !hasNext ? 'var(--faint)' : 'var(--ink, #141414)',
              cursor: !hasNext ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            Suivant
          </button>
        </div>
      </div>
    </nav>
  );
}
