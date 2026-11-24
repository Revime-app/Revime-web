'use client';

import React, { useState, useEffect } from 'react';
import type { ExportReportType, ExportPeriodPreset } from '@revime/shared';
import { Search } from 'lucide-react';
import { Icon } from './Icon';

export interface ExportsPeriodFilterToolbarProps {
  reportType: ExportReportType;
  period: ExportPeriodPreset;
  startDate?: string;
  endDate?: string;
  year?: number;
  q?: string;
  onPeriodChange: (preset: ExportPeriodPreset) => void;
  onCustomDatesChange: (start?: string, end?: string) => void;
  onYearChange: (year: number) => void;
  onSearchChange: (q: string) => void;
  onReset: () => void;
}

const PERIOD_PRESETS: Array<{ key: ExportPeriodPreset; label: string }> = [
  { key: 'this_month', label: 'Ce mois-ci' },
  { key: 'last_month', label: 'Mois dernier' },
  { key: 'this_quarter', label: 'Ce trimestre' },
  { key: 'last_quarter', label: 'Trimestre dernier' },
  { key: 'this_year', label: 'Cette année' },
  { key: 'last_year', label: 'Année dernière' },
  { key: 'custom', label: 'Personnalisé' },
];

/** The API refuses a year before 2025 (adminExportQuerySchema); the list runs from this year down to it. */
const FIRST_DAC7_YEAR = 2025;

function dac7Years(): number[] {
  const thisYear = new Date().getFullYear();
  return Array.from({ length: thisYear - FIRST_DAC7_YEAR + 1 }, (_, i) => thisYear - i);
}

export function ExportsPeriodFilterToolbar({
  reportType,
  period,
  startDate,
  endDate,
  year = new Date().getFullYear() - 1,
  q = '',
  onPeriodChange,
  onCustomDatesChange,
  onYearChange,
  onSearchChange,
  onReset,
}: ExportsPeriodFilterToolbarProps) {
  const [searchValue, setSearchValue] = useState(q);
  const [customStart, setCustomStart] = useState(startDate ?? '');
  const [customEnd, setCustomEnd] = useState(endDate ?? '');

  // Synchronize local search value when prop changes
  useEffect(() => {
    setSearchValue(q);
  }, [q]);

  useEffect(() => {
    setCustomStart(startDate ?? '');
  }, [startDate]);

  useEffect(() => {
    setCustomEnd(endDate ?? '');
  }, [endDate]);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onSearchChange(searchValue.trim());
  };

  const handleSearchChangeInternal = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchValue(val);
    onSearchChange(val);
  };

  const handleCustomStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomStart(val);
    onCustomDatesChange(val || undefined, customEnd || undefined);
  };

  const handleCustomEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomEnd(val);
    onCustomDatesChange(customStart || undefined, val || undefined);
  };

  const isDac7 = reportType === 'DAC7_ANNUAL';

  return (
    <div
      data-testid="exports-period-filter-toolbar"
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        padding: '18px 20px',
        marginBottom: '20px',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {/* Row 1: Search and Period Controls */}
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
            flex: '1 1 300px',
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
            data-testid="exports-search-input"
            value={searchValue}
            onChange={handleSearchChangeInternal}
            placeholder="Filtrer (commande, réparateur, client...)"
            aria-label="Filtrer les exports"
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

        {/* Period controls: DAC7 Year dropdown or Standard Period presets */}
        {isDac7 ? (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <label
              htmlFor="dac7-year-select"
              style={{
                fontSize: '12.5px',
                fontWeight: 600,
                color: 'var(--muted, #6b7280)',
              }}
            >
              Année fiscale DAC7 :
            </label>
            <select
              id="dac7-year-select"
              data-testid="dac7-year-select"
              value={year}
              onChange={(e) => onYearChange(Number(e.target.value))}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--navy-text, #25324f)',
                backgroundColor: 'var(--paper, #ffffff)',
                border: '1px solid var(--navy, #25324f)',
                borderRadius: 'var(--r-field, 4px)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {dac7Years().map((y) => (
                <option key={y} value={y}>
                  {`Année ${y}`}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div
            data-testid="exports-period-presets"
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
            {PERIOD_PRESETS.map((p) => {
              const isSelected = period === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  data-testid={`period-preset-${p.key}`}
                  onClick={() => onPeriodChange(p.key)}
                  style={{
                    padding: '5px 10px',
                    fontSize: '12px',
                    fontWeight: isSelected ? 600 : 500,
                    borderRadius: 'var(--r-field, 4px)',
                    border: isSelected
                      ? '1px solid var(--navy, #25324f)'
                      : '1px solid var(--line, #dfe2e2)',
                    backgroundColor: isSelected ? 'var(--badge-info-bg)' : 'var(--paper, #ffffff)',
                    color: isSelected ? 'var(--navy-text, #25324f)' : 'var(--ink, #141414)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Row 2: Custom Date Pickers (if period === 'custom' and not DAC7) & Reset Button */}
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
        {!isDac7 && period === 'custom' ? (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--muted, #6b7280)',
              }}
            >
              Intervalle :
            </span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <label
                htmlFor="custom-start-date"
                style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}
              >
                Du :
              </label>
              <input
                id="custom-start-date"
                type="date"
                data-testid="custom-start-date"
                value={customStart}
                onChange={handleCustomStartChange}
                style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  backgroundColor: 'var(--paper, #ffffff)',
                  border: '1px solid var(--line, #dfe2e2)',
                  borderRadius: 'var(--r-field, 4px)',
                  color: 'var(--ink, #141414)',
                }}
              />
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <label
                htmlFor="custom-end-date"
                style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}
              >
                Au :
              </label>
              <input
                id="custom-end-date"
                type="date"
                data-testid="custom-end-date"
                value={customEnd}
                onChange={handleCustomEndChange}
                style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  backgroundColor: 'var(--paper, #ffffff)',
                  border: '1px solid var(--line, #dfe2e2)',
                  borderRadius: 'var(--r-field, 4px)',
                  color: 'var(--ink, #141414)',
                }}
              />
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}>
            {isDac7
              ? 'Rapport fiscal annuel DAC7 (Directive UE 2021/514).'
              : 'Filtrez par période comptable prédéfinie ou saisissez des dates personnalisées.'}
          </div>
        )}

        {/* Reset button */}
        <button
          type="button"
          data-testid="exports-reset-button"
          onClick={onReset}
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
            cursor: 'pointer',
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
