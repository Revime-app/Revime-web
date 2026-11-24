'use client';

import React from 'react';
import { getAriaSort, getSortGlyph, type SortDirection } from '../lib/table-sort';

export interface SortableThProps {
  columnKey: string;
  activeKey: string | null;
  direction: SortDirection;
  label: string;
  onSort?: (key: string) => void;
  align?: 'left' | 'right' | 'center';
  style?: React.CSSProperties;
  className?: string;
}

export function SortableTh({
  columnKey,
  activeKey,
  direction,
  label,
  onSort,
  align = 'left',
  style,
  className,
}: SortableThProps) {
  const ariaSort = getAriaSort(columnKey, activeKey, direction);
  const glyph = getSortGlyph(columnKey, activeKey, direction);
  const isActive = columnKey === activeKey;

  return (
    <th
      aria-sort={ariaSort}
      className={className}
      style={{
        textAlign: align,
        padding: '10px 12px',
        fontSize: '12px',
        fontWeight: 600,
        color: isActive ? 'var(--ink, #141414)' : 'var(--muted, #6b7280)',
        borderBottom: '1px solid var(--line, #dfe2e2)',
        userSelect: 'none',
        ...style,
      }}
    >
      <button
        type="button"
        onClick={() => onSort?.(columnKey)}
        data-testid={`sort-${columnKey}`}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          font: 'inherit',
          color: 'inherit',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontWeight: isActive ? 700 : 600,
          width: align === 'right' ? '100%' : 'auto',
          justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        }}
        title={`Trier par ${label}`}
      >
        <span>{label}</span>
        <span
          aria-hidden="true"
          style={{
            fontSize: '10px',
            opacity: isActive ? 1 : 0.4,
            transition: 'opacity 0.15s ease',
          }}
        >
          {glyph}
        </span>
      </button>
    </th>
  );
}
