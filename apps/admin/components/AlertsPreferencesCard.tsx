'use client';

import React, { useState } from 'react';
import type { AdminAlertPreferences, AdminAlertPreferencesPatch } from '@revime/shared';
import { CreditCard, Package, Scale, Siren } from 'lucide-react';
import { Icon } from './Icon';
import type { LucideIcon } from 'lucide-react';

export interface AlertsPreferencesCardProps {
  preferences: AdminAlertPreferences | null;
  onUpdate: (patch: AdminAlertPreferencesPatch) => Promise<void> | void;
  loading?: boolean;
}

interface PreferenceCategory {
  id: string;
  label: string;
  icon: LucideIcon;
  emailKey: keyof AdminAlertPreferences;
  bellKey: keyof AdminAlertPreferences;
}

const PREFERENCE_CATEGORIES: PreferenceCategory[] = [
  {
    id: 'disputes',
    label: 'Litiges',
    icon: Scale,
    emailKey: 'emailDisputes',
    bellKey: 'bellDisputes',
  },
  {
    id: 'reports',
    label: 'Signalements',
    icon: Siren,
    emailKey: 'emailReports',
    bellKey: 'bellReports',
  },
  {
    id: 'payments',
    label: 'Paiements',
    icon: CreditCard,
    emailKey: 'emailPayments',
    bellKey: 'bellPayments',
  },
  {
    id: 'parcels',
    label: 'Colis',
    icon: Package,
    emailKey: 'emailParcels',
    bellKey: 'bellParcels',
  },
];

export function AlertsPreferencesCard({
  preferences,
  onUpdate,
  loading = false,
}: AlertsPreferencesCardProps) {
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  const handleToggle = async (key: keyof AdminAlertPreferences, currentValue: boolean) => {
    setUpdatingKey(key);
    try {
      await onUpdate({ [key]: !currentValue });
    } finally {
      setUpdatingKey(null);
    }
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        padding: '16px',
        marginBottom: '16px',
      }}
    >
      <div style={{ marginBottom: '14px' }}>
        <h3
          style={{
            margin: '0 0 4px 0',
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--ink, #141414)',
          }}
        >
          Préférences de notification
        </h3>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
          Activez ou désactivez les canaux d'alerte par type d'incident.
        </p>
      </div>

      {/* Header table */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 64px 64px',
          paddingBottom: '8px',
          borderBottom: '1px solid var(--line, #dfe2e2)',
          fontSize: '11px',
          fontWeight: 700,
          textTransform: 'uppercase',
          color: 'var(--muted, #6b7280)',
          letterSpacing: '0.04em',
        }}
      >
        <span>Type d'incident</span>
        <span style={{ textAlign: 'center' }}>E-mail</span>
        <span style={{ textAlign: 'center' }}>Cloche</span>
      </div>

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {PREFERENCE_CATEGORIES.map((cat, idx) => {
          const emailVal = preferences ? preferences[cat.emailKey] : true;
          const bellVal = preferences ? preferences[cat.bellKey] : true;

          return (
            <div
              key={cat.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 64px 64px',
                alignItems: 'center',
                padding: '10px 0',
                borderBottom:
                  idx < PREFERENCE_CATEGORIES.length - 1
                    ? '1px solid var(--line, #dfe2e2)'
                    : 'none',
              }}
            >
              {/* Category label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px' }} aria-hidden="true">
                  <Icon as={cat.icon} />
                </span>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--ink, #141414)',
                  }}
                >
                  {cat.label}
                </span>
              </div>

              {/* Email Toggle */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={emailVal}
                  aria-label={`Notification e-mail pour ${cat.label}`}
                  disabled={loading || updatingKey === cat.emailKey}
                  onClick={() => void handleToggle(cat.emailKey, emailVal)}
                  style={{
                    width: '36px',
                    height: '20px',
                    borderRadius: '10px',
                    backgroundColor: emailVal
                      ? 'var(--navy, #25324f)'
                      : 'var(--line, #dfe2e2)',
                    border: 'none',
                    padding: '2px',
                    cursor: loading || updatingKey === cat.emailKey ? 'wait' : 'pointer',
                    position: 'relative',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--paper, #ffffff)',
                      transform: emailVal ? 'translateX(16px)' : 'translateX(0)',
                      transition: 'transform 0.15s ease',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    }}
                  />
                </button>
              </div>

              {/* Bell Toggle */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={bellVal}
                  aria-label={`Notification cloche pour ${cat.label}`}
                  disabled={loading || updatingKey === cat.bellKey}
                  onClick={() => void handleToggle(cat.bellKey, bellVal)}
                  style={{
                    width: '36px',
                    height: '20px',
                    borderRadius: '10px',
                    backgroundColor: bellVal
                      ? 'var(--navy, #25324f)'
                      : 'var(--line, #dfe2e2)',
                    border: 'none',
                    padding: '2px',
                    cursor: loading || updatingKey === cat.bellKey ? 'wait' : 'pointer',
                    position: 'relative',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--paper, #ffffff)',
                      transform: bellVal ? 'translateX(16px)' : 'translateX(0)',
                      transition: 'transform 0.15s ease',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    }}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
