'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdminVerificationAlert } from '@revime/shared';

export interface VerificationAlertsBlockProps {
  initialAlerts?: AdminVerificationAlert[];
}

export function VerificationAlertsBlock({ initialAlerts }: VerificationAlertsBlockProps) {
  const [alerts, setAlerts] = useState<AdminVerificationAlert[]>(initialAlerts ?? []);
  const [loading, setLoading] = useState<boolean>(!initialAlerts);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialAlerts) return;
    let mounted = true;

    async function fetchAlerts() {
      try {
        setLoading(true);
        const res = await fetch('/api/proxy/admin/verifications/alerts');
        if (!res.ok) {
          throw new Error('Impossible de charger les alertes de vérification.');
        }
        const data = await res.json();
        if (mounted) {
          setAlerts(data.alerts ?? []);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Erreur inconnue.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void fetchAlerts();
    return () => {
      mounted = false;
    };
  }, [initialAlerts]);

  if (loading) {
    return (
      <div
        data-testid="verification-alerts-loading"
        style={{ marginBottom: '24px', fontSize: '14px', color: 'var(--muted, #64748b)' }}
      >
        Chargement des alertes...
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        data-testid="verification-alerts-error"
        style={{
          marginBottom: '24px',
          padding: '12px 16px',
          borderRadius: '8px',
          backgroundColor: 'var(--badge-danger-bg)',
          color: 'var(--badge-danger-text)',
          fontSize: '14px',
        }}
      >
        {error}
      </div>
    );
  }

  if (alerts.length === 0) {
    return null;
  }

  return (
    <div style={{ marginBottom: '28px' }} data-testid="verification-alerts-container">
      {/* Subtitle from mockup page9_img2.png */}
      <h2
        style={{
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--muted, #64748b)',
          margin: '0 0 12px 0',
        }}
      >
        Dossiers nécessitant une action
      </h2>

      {/* Outer Card from mockup page9_img2.png */}
      <div
        className="card"
        role="list"
        aria-label="Alertes de discordance et fraude"
        data-testid="verification-alerts-card"
        style={{
          backgroundColor: 'var(--paper)',
          borderRadius: '12px',
          border: '1px solid var(--line, #dfe2e2)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {alerts.map((alert) => {
          const isCritical = alert.severity === 'CRITICAL';
          const barColor = isCritical ? 'var(--badge-danger-text)' : 'var(--badge-warning-text)';
          const bgColor = isCritical ? 'var(--badge-danger-bg)' : 'var(--badge-warning-bg)';

          return (
            <div
              key={alert.id}
              role="listitem"
              data-testid={`verification-alert-${alert.type.toLowerCase().replace(/_/g, '-')}`}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'stretch',
                backgroundColor: bgColor,
                borderRadius: '8px',
                padding: '12px 16px 12px 20px',
                overflow: 'hidden',
              }}
            >
              {/* Colored vertical strip on left */}
              <div
                data-testid="alert-accent-bar"
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: '6px',
                  top: '10px',
                  bottom: '10px',
                  width: '4px',
                  borderRadius: '4px',
                  backgroundColor: barColor,
                }}
              />

              <div style={{ marginLeft: '6px', width: '100%' }}>
                {/* Line 1: Alert Title with linked user name */}
                <div
                  data-testid="alert-title"
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: 'var(--navy-text, #25324f)',
                    marginBottom: '4px',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      width: '1px',
                      height: '1px',
                      padding: 0,
                      margin: '-1px',
                      overflow: 'hidden',
                      clip: 'rect(0, 0, 0, 0)',
                      whiteSpace: 'nowrap',
                      border: 0,
                    }}
                  >
                    {isCritical ? 'Alerte critique : ' : 'Avertissement : '}
                  </span>
                  <Link
                    href={alert.userHref}
                    style={{
                      color: 'var(--navy-text, #25324f)',
                      textDecoration: 'none',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.textDecoration = 'underline';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.textDecoration = 'none';
                    }}
                  >
                    {alert.title}
                  </Link>
                </div>

                {/* Line 2: Description */}
                <div
                  data-testid="alert-detail"
                  style={{
                    fontSize: '13px',
                    color: 'var(--ink2)',
                    lineHeight: 1.45,
                  }}
                >
                  {alert.detail}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
