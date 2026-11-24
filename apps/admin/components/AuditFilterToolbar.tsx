'use client';

import React, { useState, useEffect } from 'react';
import {
  type AdminAuditDomain,
  ADMIN_AUDIT_DOMAINS,
  getActionLabel,
} from '@revime/shared';
import { auditRangeBounds } from '../lib/audit-range';
import { Search } from 'lucide-react';
import { Icon } from './Icon';

export interface AuditFilterState {
  q?: string;
  domain?: AdminAuditDomain | '';
  action?: string;
  statusFamily?: '2xx' | '4xx' | '5xx' | '';
  startDate?: string;
  endDate?: string;
  datePreset?: 'TODAY' | '7D' | '30D' | 'ALL' | 'CUSTOM';
}

export interface AuditFilterToolbarProps {
  filters: AuditFilterState;
  onChange: (filters: AuditFilterState) => void;
  onReset: () => void;
  loading?: boolean;
}

const DOMAIN_KEYS: AdminAuditDomain[] = [
  'COMMANDES',
  'USERS',
  'LITIGES_SIGNALEMENTS',
  'CATALOGUE_CONTENU',
  'MARKETING_PROMOS',
  'SECURITE_AUTH',
];

export function AuditFilterToolbar({
  filters,
  onChange,
  onReset,
  loading = false,
}: AuditFilterToolbarProps) {
  const [searchValue, setSearchValue] = useState(filters.q ?? '');

  // Synchronize local search state if filters.q is modified externally (e.g. reset)
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

  const handlePresetClick = (preset: 'TODAY' | '7D' | '30D' | 'ALL') => {
    const now = new Date();
    if (preset === 'TODAY') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      onChange({
        ...filters,
        datePreset: 'TODAY',
        startDate: start.toISOString(),
        endDate: now.toISOString(),
      });
    } else if (preset === '7D') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      onChange({
        ...filters,
        datePreset: '7D',
        startDate: start.toISOString(),
        endDate: now.toISOString(),
      });
    } else if (preset === '30D') {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      onChange({
        ...filters,
        datePreset: '30D',
        startDate: start.toISOString(),
        endDate: now.toISOString(),
      });
    } else {
      onChange({
        ...filters,
        datePreset: 'ALL',
        startDate: undefined,
        endDate: undefined,
      });
    }
  };

  // « Du … au … »: the days are the operator's (Paris), the last one included.
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const applyCustomRange = (from: string, to: string) => {
    setCustomFrom(from);
    setCustomTo(to);
    const bounds = auditRangeBounds(from, to);
    if (!bounds) return;
    if (!from && !to) {
      onChange({ ...filters, datePreset: 'ALL', startDate: undefined, endDate: undefined });
      return;
    }
    onChange({ ...filters, datePreset: 'CUSTOM', startDate: bounds.startDate, endDate: bounds.endDate });
  };
  // A preset or the reset button replaces the range: drop the typed days with it.
  useEffect(() => {
    if (filters.datePreset !== 'CUSTOM') {
      setCustomFrom('');
      setCustomTo('');
    }
  }, [filters.datePreset]);

  const handleDomainSelect = (domainKey: AdminAuditDomain | '') => {
    if (domainKey === (filters.domain ?? '')) return;

    // Check if currently selected action belongs to the new domain
    let nextAction = filters.action;
    if (nextAction && domainKey !== '') {
      const validActions = ADMIN_AUDIT_DOMAINS[domainKey].actions as string[];
      if (!validActions.includes(nextAction)) {
        nextAction = undefined;
      }
    }

    onChange({
      ...filters,
      domain: domainKey,
      action: nextAction || undefined,
    });
  };

  // Build the list of actions for the dropdown
  const availableActions = React.useMemo(() => {
    if (filters.domain && ADMIN_AUDIT_DOMAINS[filters.domain]) {
      return ADMIN_AUDIT_DOMAINS[filters.domain].actions as string[];
    }
    // Flatten all actions
    return Array.from(
      new Set(
        DOMAIN_KEYS.flatMap((key) => ADMIN_AUDIT_DOMAINS[key].actions as string[]),
      ),
    );
  }, [filters.domain]);

  const activePreset = filters.datePreset ?? (!filters.startDate && !filters.endDate ? 'ALL' : 'CUSTOM');

  return (
    <div
      data-testid="audit-filter-toolbar"
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
      {/* Row 1: Search bar and Quick Date Presets */}
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
            data-testid="audit-search-input"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onBlur={handleSearchBlur}
            placeholder="Rechercher par opérateur, ID cible, action…"
            aria-label="Recherche par mot-clé"
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

        {/* Date presets buttons */}
        <div
          data-testid="audit-date-presets"
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
          {[
            { key: 'TODAY', label: "Aujourd'hui" },
            { key: '7D', label: '7j' },
            { key: '30D', label: '30j' },
            { key: 'ALL', label: 'Tout' },
          ].map((preset) => {
            const isSelected = activePreset === preset.key;
            return (
              <button
                key={preset.key}
                type="button"
                data-testid={`audit-date-preset-${preset.key.toLowerCase()}`}
                onClick={() => handlePresetClick(preset.key as any)}
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
          <label style={{ fontSize: '12px', color: 'var(--muted, #6b7280)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            Du
            <input
              type="date"
              data-testid="audit-range-from"
              value={customFrom}
              max={customTo || undefined}
              disabled={loading}
              onChange={(e) => applyCustomRange(e.target.value, customTo)}
              style={{ padding: '4px 6px', fontSize: '12.5px', border: '1px solid var(--line, #dfe2e2)', borderRadius: 'var(--r-field, 4px)', backgroundColor: 'var(--paper, #ffffff)', color: 'var(--ink, #141414)' }}
            />
          </label>
          <label style={{ fontSize: '12px', color: 'var(--muted, #6b7280)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            au
            <input
              type="date"
              data-testid="audit-range-to"
              value={customTo}
              min={customFrom || undefined}
              disabled={loading}
              onChange={(e) => applyCustomRange(customFrom, e.target.value)}
              style={{ padding: '4px 6px', fontSize: '12.5px', border: '1px solid var(--line, #dfe2e2)', borderRadius: 'var(--r-field, 4px)', backgroundColor: 'var(--paper, #ffffff)', color: 'var(--ink, #141414)' }}
            />
          </label>
        </div>
      </div>

      {/* Row 2: Domain pills */}
      <div
        data-testid="audit-domain-pills"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexWrap: 'wrap',
          paddingTop: '6px',
          borderTop: '1px solid var(--line, #dfe2e2)',
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
          Domaine :
        </span>
        <button
          type="button"
          data-testid="audit-domain-pill-all"
          onClick={() => handleDomainSelect('')}
          disabled={loading}
          style={{
            padding: '5px 12px',
            fontSize: '12px',
            fontWeight: !filters.domain ? 600 : 500,
            borderRadius: '9999px',
            border: !filters.domain
              ? '1px solid var(--navy, #25324f)'
              : '1px solid var(--line, #dfe2e2)',
            backgroundColor: !filters.domain ? 'var(--badge-info-bg)' : 'var(--paper, #ffffff)',
            color: !filters.domain ? 'var(--navy-text, #25324f)' : 'var(--ink, #141414)',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Tous
        </button>

        {DOMAIN_KEYS.map((domainKey) => {
          const isSelected = filters.domain === domainKey;
          const domainDef = ADMIN_AUDIT_DOMAINS[domainKey];
          return (
            <button
              key={domainKey}
              type="button"
              data-testid={`audit-domain-pill-${domainKey.toLowerCase()}`}
              onClick={() => handleDomainSelect(domainKey)}
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
              {domainDef.label}
            </button>
          );
        })}
      </div>

      {/* Row 3: Scoped Action dropdown, Status family dropdown, and Reset */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          paddingTop: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Action Select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label
              htmlFor="audit-action-select"
              style={{
                margin: 0,
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--muted, #6b7280)',
                whiteSpace: 'nowrap',
              }}
            >
              Action :
            </label>
            <select
              id="audit-action-select"
              data-testid="audit-action-select"
              value={filters.action ?? ''}
              onChange={(e) =>
                onChange({
                  ...filters,
                  action: e.target.value || undefined,
                })
              }
              disabled={loading}
              style={{
                padding: '6px 10px',
                fontSize: '12.5px',
                borderRadius: 'var(--r-field, 4px)',
                border: '1px solid var(--line, #dfe2e2)',
                backgroundColor: 'var(--paper, #ffffff)',
                color: 'var(--ink, #141414)',
                cursor: loading ? 'not-allowed' : 'pointer',
                maxWidth: '280px',
              }}
            >
              <option value="">Toutes les actions</option>
              {availableActions.map((act) => (
                <option key={act} value={act}>
                  {getActionLabel(act)} ({act})
                </option>
              ))}
            </select>
          </div>

          {/* Status Family Select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label
              htmlFor="audit-status-select"
              style={{
                margin: 0,
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--muted, #6b7280)',
                whiteSpace: 'nowrap',
              }}
            >
              Statut :
            </label>
            <select
              id="audit-status-select"
              data-testid="audit-status-select"
              value={filters.statusFamily ?? ''}
              onChange={(e) =>
                onChange({
                  ...filters,
                  statusFamily: (e.target.value as any) || undefined,
                })
              }
              disabled={loading}
              style={{
                padding: '6px 10px',
                fontSize: '12.5px',
                borderRadius: 'var(--r-field, 4px)',
                border: '1px solid var(--line, #dfe2e2)',
                backgroundColor: 'var(--paper, #ffffff)',
                color: 'var(--ink, #141414)',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              <option value="">Tous statuts</option>
              <option value="2xx">2xx (Succès)</option>
              <option value="4xx">4xx (Erreurs client)</option>
              <option value="5xx">5xx (Erreurs serveur)</option>
            </select>
          </div>
        </div>

        {/* Reset button */}
        <button
          type="button"
          data-testid="audit-reset-filters-btn"
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
