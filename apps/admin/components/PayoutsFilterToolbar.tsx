'use client';

import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { Icon } from './Icon';

export interface PayoutFilterState {
  q?: string;
  status: 'ALL' | 'TRANSFERRED' | 'PENDING' | 'HELD' | 'FAILED' | 'REVERSED';
  period: 'today' | '7d' | '30d' | 'all';
}

export interface PayoutsFilterToolbarProps {
  filters: PayoutFilterState;
  onChange: (filters: PayoutFilterState) => void;
  onReset: () => void;
  loading?: boolean;
}

const PERIOD_PRESETS: Array<{ key: PayoutFilterState['period']; label: string }> = [
  { key: 'today', label: "Aujourd'hui" },
  { key: '7d', label: '7 derniers jours' },
  { key: '30d', label: '30 derniers jours' },
  { key: 'all', label: 'Tout' },
];

const STATUS_PILLS: Array<{ key: PayoutFilterState['status']; label: string }> = [
  { key: 'ALL', label: 'Tous' },
  { key: 'TRANSFERRED', label: 'Transférés' },
  { key: 'PENDING', label: 'En attente' },
  { key: 'HELD', label: 'En attente du réparateur' }, // V8 ISS8-013
  { key: 'FAILED', label: 'Échoués' },
  { key: 'REVERSED', label: 'Remboursés' },
];

export function PayoutsFilterToolbar({
  filters,
  onChange,
  onReset,
  loading = false,
}: PayoutsFilterToolbarProps) {
  const [searchValue, setSearchValue] = useState(filters.q ?? '');

  // Keep local search input synchronized with external changes (e.g. on reset)
  useEffect(() => {
    setSearchValue(filters.q ?? '');
  }, [filters.q]);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = searchValue.trim();
    if (trimmed !== (filters.q ?? '')) {
      onChange({
        ...filters,
        q: trimmed || undefined,
      });
    }
  };

  const handleSearchBlur = () => {
    const trimmed = searchValue.trim();
    if (trimmed !== (filters.q ?? '')) {
      onChange({
        ...filters,
        q: trimmed || undefined,
      });
    }
  };

  const handlePeriodChange = (period: PayoutFilterState['period']) => {
    if (period === filters.period) return;
    onChange({
      ...filters,
      period,
    });
  };

  const handleStatusChange = (status: PayoutFilterState['status']) => {
    if (status === filters.status) return;
    onChange({
      ...filters,
      status,
    });
  };

  return (
    <div
      data-testid="payouts-filter-toolbar"
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        padding: '18px 20px',
        marginBottom: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {/* Row 1: Search bar and Period Presets */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        {/* Search input */}
        <form
          onSubmit={handleSearchSubmit}
          style={{
            flex: '1 1 320px',
            position: 'relative',
            display: 'flex',
            flexDirection: 'row',
            margin: 0,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '14px',
              color: 'var(--muted, #6b7280)',
              pointerEvents: 'none',
            }}
          >
            <Icon as={Search} />
          </span>
          <input
            type="search"
            data-testid="payouts-search-input"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onBlur={handleSearchBlur}
            placeholder="Rechercher par Commande #, Réparateur, ID Virement…"
            aria-label="Rechercher des versements"
            disabled={loading}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              fontSize: '13.5px',
              backgroundColor: 'var(--paper, #ffffff)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
              color: 'var(--ink, #141414)',
              outline: 'none',
            }}
          />
        </form>

        {/* Period presets */}
        <div
          data-testid="payouts-period-presets"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--muted, #6b7280)',
              marginRight: '2px',
            }}
          >
            Période :
          </span>
          {PERIOD_PRESETS.map((preset) => {
            const isSelected = filters.period === preset.key;
            return (
              <button
                key={preset.key}
                type="button"
                data-testid={`payouts-period-${preset.key}`}
                onClick={() => handlePeriodChange(preset.key)}
                disabled={loading}
                style={{
                  padding: '6px 12px',
                  fontSize: '12.5px',
                  fontWeight: isSelected ? 600 : 500,
                  borderRadius: 'var(--r-field, 4px)',
                  border: isSelected
                    ? '1px solid var(--navy, #25324f)'
                    : '1px solid var(--line, #dfe2e2)',
                  backgroundColor: isSelected ? 'var(--navy-soft, #f0f1f5)' : 'var(--paper, #ffffff)',
                  color: isSelected ? 'var(--navy-text, #25324f)' : 'var(--ink, #141414)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 2: Status Pills & Reset Button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          paddingTop: '6px',
          borderTop: '1px solid var(--line, #dfe2e2)',
        }}
      >
        {/* Status filter pills */}
        <div
          data-testid="payouts-status-pills"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--muted, #6b7280)',
              marginRight: '4px',
            }}
          >
            Statut :
          </span>
          {STATUS_PILLS.map((pill) => {
            const isSelected = filters.status === pill.key;
            return (
              <button
                key={pill.key}
                type="button"
                data-testid={`payouts-status-pill-${pill.key.toLowerCase()}`}
                onClick={() => handleStatusChange(pill.key)}
                disabled={loading}
                style={{
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: isSelected ? 600 : 500,
                  borderRadius: '9999px',
                  border: isSelected
                    ? '1px solid var(--navy, #25324f)'
                    : '1px solid var(--line, #dfe2e2)',
                  backgroundColor: isSelected ? 'var(--badge-info-bg)' : 'var(--paper, #ffffff)',
                  color: isSelected ? 'var(--navy-text, #25324f)' : 'var(--ink, #141414)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        {/* Reset button */}
        <button
          type="button"
          data-testid="payouts-reset-filters-btn"
          onClick={onReset}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            fontSize: '12.5px',
            fontWeight: 500,
            borderRadius: 'var(--r-field, 4px)',
            border: '1px solid var(--line, #dfe2e2)',
            backgroundColor: 'var(--paper, #ffffff)',
            color: 'var(--navy-text, #25324f)',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.15s ease',
          }}
        >
          <span aria-hidden="true">↺</span>
          <span>Réinitialiser</span>
        </button>
      </div>
    </div>
  );
}
