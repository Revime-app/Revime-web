'use client';

import { useState } from 'react';
import type { AdminStatsPeriod } from '@revime/shared';

export const STATS_PERIOD_OPTIONS: Array<{ id: AdminStatsPeriod; label: string }> = [
  { id: '7d', label: '7 jours' },
  { id: '30d', label: '30 jours' },
  { id: '90d', label: '90 jours' },
  { id: '12m', label: '12 mois' },
  { id: 'all', label: 'Tout' },
  { id: 'custom', label: 'Personnalisé' },
];

export interface StatsPeriodSelectorProps {
  period: AdminStatsPeriod;
  onPeriodChange: (period: AdminStatsPeriod, customRange?: { from: string; to: string }) => void;
  customFrom?: string;
  customTo?: string;
  onCustomRangeChange?: (from: string, to: string) => void;
  disabled?: boolean;
}

export function StatsPeriodSelector({
  period,
  onPeriodChange,
  customFrom,
  customTo,
  onCustomRangeChange,
  disabled = false,
}: StatsPeriodSelectorProps) {
  const [fromVal, setFromVal] = useState<string>(
    () => customFrom || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );
  const [toVal, setToVal] = useState<string>(
    () => customTo || new Date().toISOString().slice(0, 10),
  );

  const handlePillClick = (id: AdminStatsPeriod) => {
    if (id === 'custom') {
      onPeriodChange('custom', { from: fromVal, to: toVal });
    } else {
      onPeriodChange(id);
    }
  };

  const handleApply = () => {
    onPeriodChange('custom', { from: fromVal, to: toVal });
    onCustomRangeChange?.(fromVal, toVal);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '8px',
      }}
    >
      <div
        role="group"
        aria-label="Sélection de la période d'analyse"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          backgroundColor: 'var(--paper, #ffffff)',
          padding: '4px',
          borderRadius: 'var(--r-pill, 999px)',
          border: '1px solid var(--line, #dfe2e2)',
          flexWrap: 'wrap',
        }}
      >
        {STATS_PERIOD_OPTIONS.map(({ id, label }) => {
          const isSelected = period === id;
          return (
            <button
              key={id}
              type="button"
              data-testid={`period-pill-${id}`}
              disabled={disabled}
              aria-pressed={isSelected}
              onClick={() => handlePillClick(id)}
              style={{
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: isSelected ? 600 : 500,
                borderRadius: 'var(--r-pill, 999px)',
                border: 'none',
                backgroundColor: isSelected ? 'var(--navy, #25324f)' : 'transparent',
                color: isSelected ? 'var(--paper, #ffffff)' : 'var(--ink, #141414)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
                opacity: disabled ? 0.6 : 1,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {period === 'custom' && (
        <div
          data-testid="stats-custom-range-picker"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            padding: '6px 12px',
            backgroundColor: 'var(--paper, #ffffff)',
            borderRadius: 'var(--r-field, 6px)',
            border: '1px solid var(--line, #dfe2e2)',
          }}
        >
          <label
            htmlFor="stats-date-from"
            style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted, #6b7280)' }}
          >
            Du
          </label>
          <input
            id="stats-date-from"
            data-testid="stats-date-from"
            type="date"
            disabled={disabled}
            value={fromVal}
            max={toVal || undefined}
            onChange={(e) => setFromVal(e.target.value)}
            style={{
              padding: '4px 8px',
              fontSize: '13px',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
              backgroundColor: 'var(--paper, #ffffff)',
              color: 'var(--ink, #141414)',
              outline: 'none',
            }}
          />
          <label
            htmlFor="stats-date-to"
            style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted, #6b7280)' }}
          >
            Au
          </label>
          <input
            id="stats-date-to"
            data-testid="stats-date-to"
            type="date"
            disabled={disabled}
            value={toVal}
            min={fromVal || undefined}
            onChange={(e) => setToVal(e.target.value)}
            style={{
              padding: '4px 8px',
              fontSize: '13px',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
              backgroundColor: 'var(--paper, #ffffff)',
              color: 'var(--ink, #141414)',
              outline: 'none',
            }}
          />
          <button
            type="button"
            data-testid="stats-apply-custom-range"
            disabled={disabled || !fromVal || !toVal || fromVal > toVal}
            onClick={handleApply}
            style={{
              padding: '5px 12px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: 'var(--navy, #25324f)',
              color: 'var(--on-accent, #ffffff)',
              border: 'none',
              borderRadius: 'var(--r-field, 4px)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.15s ease',
              opacity: disabled ? 0.6 : 1,
            }}
          >
            Appliquer
          </button>
        </div>
      )}
    </div>
  );
}
