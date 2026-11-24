'use client';

import React from 'react';
import type { AdminConversationStatusFilter } from '@revime/shared';

export interface ConversationsFilterToolbarProps {
  q: string;
  status: AdminConversationStatusFilter;
  hasDispute: boolean;
  hasReport: boolean;
  onSearchChange: (q: string) => void;
  onStatusChange: (status: AdminConversationStatusFilter) => void;
  onHasDisputeChange: (hasDispute: boolean) => void;
  onHasReportChange: (hasReport: boolean) => void;
  onReset: () => void;
}

export function ConversationsFilterToolbar({
  q,
  status,
  hasDispute,
  hasReport,
  onSearchChange,
  onStatusChange,
  onHasDisputeChange,
  onHasReportChange,
  onReset,
}: ConversationsFilterToolbarProps) {
  const statusOptions: Array<{ label: string; value: AdminConversationStatusFilter }> = [
    { label: 'Toutes', value: 'all' },
    { label: 'Actives', value: 'open' },
    { label: 'Fermées', value: 'closed' },
  ];

  const hasActiveFilters = q.trim() !== '' || status !== 'all' || hasDispute || hasReport;

  return (
    <div
      style={{
        background: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* Search Input with Clear Button */}
      <div style={{ position: 'relative', width: '100%' }}>
        <input
          type="search"
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Rechercher par client, réparateur, demande, message..."
          style={{
            width: '100%',
            height: '38px',
            padding: '0 32px 0 12px',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: '6px',
            fontSize: '13px',
            color: 'var(--ink, #141414)',
            backgroundColor: 'var(--paper, #ffffff)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {q.trim() && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Effacer la recherche"
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              color: 'var(--ink-muted, #737373)',
              cursor: 'pointer',
              fontSize: '16px',
              lineHeight: 1,
              padding: '4px',
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Status Pills and Toggles Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        {/* Status Pills */}
        <div style={{ display: 'inline-flex', gap: '6px' }} role="group" aria-label="Filtre par statut">
          {statusOptions.map((opt) => {
            const isActive = status === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onStatusChange(opt.value)}
                aria-pressed={isActive}
                style={{
                  padding: '6px 12px',
                  borderRadius: '16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: isActive
                    ? '1px solid var(--navy, #25324f)'
                    : '1px solid var(--line, #dfe2e2)',
                  background: isActive ? 'var(--navy, #25324f)' : 'var(--paper, #ffffff)',
                  color: isActive ? '#ffffff' : 'var(--ink, #141414)',
                  transition: 'background-color 0.15s ease, border-color 0.15s ease',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Checkbox Toggles & Reset */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--ink, #141414)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={hasDispute}
              onChange={(e) => onHasDisputeChange(e.target.checked)}
              style={{ accentColor: 'var(--navy, #25324f)', cursor: 'pointer' }}
            />
            <span>Litiges uniquement</span>
          </label>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--ink, #141414)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={hasReport}
              onChange={(e) => onHasReportChange(e.target.checked)}
              style={{ accentColor: 'var(--accent, #f61b39)', cursor: 'pointer' }}
            />
            <span>Signalées uniquement</span>
          </label>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={onReset}
              style={{
                background: 'transparent',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '12px',
                color: 'var(--ink-muted, #555555)',
                cursor: 'pointer',
              }}
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
