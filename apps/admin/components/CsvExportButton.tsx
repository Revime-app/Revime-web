'use client';

import React from 'react';
import { Download } from 'lucide-react';
import { Icon } from './Icon';

export interface CsvExportButtonProps {
  onClick: () => void;
  label?: string;
  disabled?: boolean;
  count?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function CsvExportButton({
  onClick,
  label = 'Exporter en CSV',
  disabled = false,
  count,
  className,
  style,
}: CsvExportButtonProps) {
  return (
    <button
      type="button"
      data-testid="csv-export-button"
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        fontSize: '13px',
        fontWeight: 500,
        backgroundColor: disabled ? 'var(--badge-neutral-bg)' : 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-field, 4px)',
        color: disabled ? 'var(--faint)' : 'var(--ink, #141414)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 0.15s ease',
        ...style,
      }}
      title={count !== undefined ? `${label} (${count} lignes)` : label}
    >
      <span aria-hidden="true"><Icon as={Download} /></span>
      <span>{label}</span>
      {count !== undefined && (
        <span
          style={{
            fontSize: '11px',
            color: 'var(--muted, #6b7280)',
            backgroundColor: 'var(--badge-neutral-bg)',
            padding: '1px 6px',
            borderRadius: '9999px',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
