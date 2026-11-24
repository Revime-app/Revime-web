'use client';

import React from 'react';
import type { AdminAlertSeverity, AdminAlertType } from '@revime/shared';
import { CreditCard, Lock, Package, Scale, ShieldAlert, ShieldCheck, ShieldOff, Siren } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Icon } from './Icon';

export type AlertTypeFilter = AdminAlertType | 'ALL';
export type AlertSeverityFilter = AdminAlertSeverity | 'ALL';
export type AlertReadFilter = 'false' | 'all' | 'true';

export interface AlertsFilterToolbarProps {
  type: AlertTypeFilter;
  severity: AlertSeverityFilter;
  isRead: AlertReadFilter;
  q: string;
  unreadCount?: number;
  markingAllAsRead?: boolean;
  onTypeChange: (type: AlertTypeFilter) => void;
  onSeverityChange: (sev: AlertSeverityFilter) => void;
  onIsReadChange: (isRead: AlertReadFilter) => void;
  onSearchChange: (q: string) => void;
  onMarkAllAsRead: () => void | Promise<void>;
}

const TYPE_PILLS: { id: AlertTypeFilter; label: string; icon?: LucideIcon }[] = [
  { id: 'ALL', label: 'Toutes' },
  { id: 'DISPUTE_NEW', label: 'Litiges', icon: Scale },
  { id: 'REPORT_SEVERE', label: 'Signalements', icon: Siren },
  { id: 'PAYMENT_FAILED', label: 'Paiements', icon: CreditCard },
  { id: 'PARCEL_INCIDENT', label: 'Colis', icon: Package },
  { id: 'ACCOUNT_LOCKED', label: 'Comptes bloqués', icon: Lock },
  { id: 'IP_BLOCKED', label: 'IP bloquées', icon: ShieldAlert },
  { id: 'ACCOUNT_SECURED', label: 'Comptes sécurisés', icon: ShieldCheck },
  { id: 'PROVIDER_REVOKE_FAILED', label: 'Révocations échouées', icon: ShieldOff },
];

const SEVERITY_OPTIONS: { id: AlertSeverityFilter; label: string }[] = [
  { id: 'ALL', label: 'Toutes les sévérités' },
  { id: 'CRITICAL', label: 'Critique' },
  { id: 'HIGH', label: 'Élevée' },
  { id: 'MEDIUM', label: 'Modérée' },
];

const READ_TABS: { id: AlertReadFilter; label: string }[] = [
  { id: 'false', label: 'Non lues' },
  { id: 'all', label: 'Toutes les alertes' },
  { id: 'true', label: 'Lues' },
];

export function AlertsFilterToolbar({
  type,
  severity,
  isRead,
  q,
  unreadCount = 0,
  markingAllAsRead = false,
  onTypeChange,
  onSeverityChange,
  onIsReadChange,
  onSearchChange,
  onMarkAllAsRead,
}: AlertsFilterToolbarProps) {
  return (
    <div
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        padding: '16px',
        marginBottom: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      {/* Top Row: Type Pills & Mark All As Read */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        {/* Type pills */}
        <div
          role="group"
          aria-label="Filtrer par type d'alerte"
          style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}
        >
          {TYPE_PILLS.map((pill) => {
            const isActive = type === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => onTypeChange(pill.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  border: isActive
                    ? '1px solid var(--navy, #25324f)'
                    : '1px solid var(--line, #dfe2e2)',
                  backgroundColor: isActive
                    ? 'var(--navy, #25324f)'
                    : 'var(--paper, #ffffff)',
                  color: isActive ? '#ffffff' : 'var(--ink, #141414)',
                  transition: 'background-color 0.15s ease, border-color 0.15s ease',
                }}
              >
                {pill.icon && <Icon as={pill.icon} />}
                <span>{pill.label}</span>
              </button>
            );
          })}
        </div>

        {/* Action: Mark All As Read */}
        <button
          type="button"
          onClick={() => void onMarkAllAsRead()}
          disabled={markingAllAsRead || unreadCount === 0}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--navy, #25324f)',
            color: '#ffffff',
            border: 'none',
            borderRadius: 'var(--r-field, 4px)',
            padding: '8px 14px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: markingAllAsRead || unreadCount === 0 ? 'not-allowed' : 'pointer',
            opacity: markingAllAsRead || unreadCount === 0 ? 0.6 : 1,
            transition: 'opacity 0.15s ease',
          }}
        >
          {markingAllAsRead ? 'Marquage en cours...' : 'Tout marquer comme lu'}
        </button>
      </div>

      {/* Bottom Row: Read Status Tabs, Severity Dropdown, and Search Input */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          paddingTop: '10px',
          borderTop: '1px solid var(--line, #dfe2e2)',
        }}
      >
        {/* Read Status segmented tabs */}
        <div
          role="tablist"
          aria-label="Filtrer par statut de lecture"
          style={{
            display: 'inline-flex',
            backgroundColor: 'var(--badge-neutral-bg)',
            padding: '3px',
            borderRadius: '6px',
            border: '1px solid var(--line, #dfe2e2)',
          }}
        >
          {READ_TABS.map((tab) => {
            const isActive = isRead === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={isActive}
                onClick={() => onIsReadChange(tab.id)}
                style={{
                  padding: '5px 12px',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 500,
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: isActive ? 'var(--paper, #ffffff)' : 'transparent',
                  color: isActive ? 'var(--navy-text, #25324f)' : 'var(--muted, #6b7280)',
                  boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease, color 0.15s ease',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Right side: Severity Select and Search Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Severity Dropdown */}
          <select
            aria-label="Filtrer par sévérité"
            value={severity}
            onChange={(e) => onSeverityChange(e.target.value as AlertSeverityFilter)}
            style={{
              padding: '6px 10px',
              fontSize: '13px',
              borderRadius: 'var(--r-field, 4px)',
              border: '1px solid var(--line, #dfe2e2)',
              backgroundColor: 'var(--paper, #ffffff)',
              color: 'var(--ink, #141414)',
              cursor: 'pointer',
              height: '34px',
            }}
          >
            {SEVERITY_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Search Input with Clear Button */}
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Rechercher une alerte..."
              aria-label="Rechercher une alerte"
              value={q}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{
                padding: '6px 28px 6px 10px',
                fontSize: '13px',
                borderRadius: 'var(--r-field, 4px)',
                border: '1px solid var(--line, #dfe2e2)',
                backgroundColor: 'var(--paper, #ffffff)',
                color: 'var(--ink, #141414)',
                width: '210px',
                height: '34px',
                outline: 'none',
              }}
            />
            {q && (
              <button
                type="button"
                aria-label="Effacer la recherche"
                onClick={() => onSearchChange('')}
                style={{
                  position: 'absolute',
                  right: '6px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--muted, #6b7280)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 700,
                  padding: '2px 4px',
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
