'use client';

import React from 'react';
import Link from 'next/link';
import {
  ADMIN_ALERT_TYPE_LABELS,
  timeAgoLabel,
  type AdminAlertItem,
  type AdminAlertSeverity,
} from '@revime/shared';
import { Sparkles } from 'lucide-react';
import { alertTypeIcon } from '../lib/alert-type-icons';
import { Icon } from './Icon';

export interface AlertsTableProps {
  alerts: AdminAlertItem[];
  total: number;
  page: number;
  limit: number;
  loading?: boolean;
  onPageChange: (newPage: number) => void;
  onMarkAsRead: (alertId: string) => void | Promise<void>;
}

export const getSeverityBadgeStyle = (severity: AdminAlertSeverity): React.CSSProperties => {
  switch (severity) {
    case 'CRITICAL':
      return {
        color: 'var(--navy-text, #f61b39)',
        backgroundColor: 'var(--badge-danger-bg)',
        border: '1px solid var(--badge-danger-border)',
      };
    case 'HIGH':
      return {
        color: 'var(--badge-warning-text)',
        backgroundColor: 'var(--badge-warning-bg)',
        border: '1px solid var(--badge-warning-bg)',
      };
    case 'MEDIUM':
    default:
      return {
        color: 'var(--navy-text, #25324f)',
        backgroundColor: 'var(--navy-soft)',
        border: '1px solid var(--line, #dfe2e2)',
      };
  }
};

export const getSeverityLabel = (severity: AdminAlertSeverity): string => {
  switch (severity) {
    case 'CRITICAL':
      return 'Critique';
    case 'HIGH':
      return 'Élevée';
    case 'MEDIUM':
    default:
      return 'Modérée';
  }
};

export function AlertsTable({
  alerts,
  total,
  page,
  limit,
  loading = false,
  onPageChange,
  onMarkAsRead,
}: AlertsTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  if (alerts.length === 0 && !loading) {
    return (
      <div
        style={{
          backgroundColor: 'var(--paper, #ffffff)',
          border: '1px solid var(--line, #dfe2e2)',
          borderRadius: 'var(--r-card, 8px)',
          padding: '48px 24px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '36px', marginBottom: '12px' }}><Icon as={Sparkles} /></div>
        <h3
          style={{
            margin: '0 0 8px 0',
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--ink, #141414)',
          }}
        >
          Aucune alerte opérationnelle trouvée
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: '14px',
            color: 'var(--muted, #6b7280)',
            maxWidth: '420px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          Tous les incidents sont actuellement résolus ou ne correspondent pas aux filtres.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        overflow: 'hidden',
      }}
    >
      {/* Alert items list */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {alerts.map((alert, idx) => {
          const typeMeta = {
            label: ADMIN_ALERT_TYPE_LABELS[alert.type]?.label ?? alert.type,
            icon: alertTypeIcon(alert.type),
          };
          const severityStyle = getSeverityBadgeStyle(alert.severity);
          const severityLabel = getSeverityLabel(alert.severity);
          const timeText = timeAgoLabel(alert.createdAt, new Date()) || 'Récemment';

          return (
            <div
              key={alert.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '16px',
                padding: '16px 20px',
                borderBottom:
                  idx < alerts.length - 1 ? '1px solid var(--line, #dfe2e2)' : 'none',
                backgroundColor: alert.isRead ? 'var(--paper, #ffffff)' : 'var(--badge-neutral-bg)',
                borderLeft: alert.isRead
                  ? '4px solid transparent'
                  : '4px solid var(--accent, #f61b39)',
                transition: 'background-color 0.15s ease',
              }}
            >
              {/* Left Details */}
              <div style={{ display: 'flex', gap: '14px', flex: 1, minWidth: 0 }}>
                {/* Category Icon */}
                <div
                  style={{
                    fontSize: '22px',
                    lineHeight: '1',
                    marginTop: '2px',
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                >
                  <Icon as={typeMeta.icon} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Badges & Meta Row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap',
                      marginBottom: '6px',
                    }}
                  >
                    {/* Severity Badge */}
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        ...severityStyle,
                      }}
                    >
                      {severityLabel}
                    </span>

                    {/* Type Label */}
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--navy-text, #25324f)',
                      }}
                    >
                      {typeMeta.label}
                    </span>

                    <span style={{ color: 'var(--line, #dfe2e2)' }}>•</span>

                    {/* Target reference */}
                    <span
                      style={{
                        fontSize: '12px',
                        color: 'var(--muted, #6b7280)',
                        fontFamily: 'monospace',
                      }}
                    >
                      {alert.targetType} #{alert.targetId}
                    </span>

                    <span style={{ color: 'var(--line, #dfe2e2)' }}>•</span>

                    {/* Timestamp */}
                    <span style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}>
                      {timeText}
                    </span>

                    {alert.isRead && alert.readByUserName && (
                      <>
                        <span style={{ color: 'var(--line, #dfe2e2)' }}>•</span>
                        <span style={{ fontSize: '11px', color: 'var(--muted, #6b7280)' }}>
                          Lu par {alert.readByUserName}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Title */}
                  <h4
                    style={{
                      margin: '0 0 4px 0',
                      fontSize: '15px',
                      fontWeight: alert.isRead ? 600 : 700,
                      color: 'var(--ink, #141414)',
                    }}
                  >
                    {alert.title}
                  </h4>

                  {/* Message snippet */}
                  <p
                    style={{
                      margin: 0,
                      fontSize: '13px',
                      color: 'var(--ink2)',
                      lineHeight: '1.45',
                    }}
                  >
                    {alert.message}
                  </p>
                </div>
              </div>

              {/* Right Action buttons */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexShrink: 0,
                  marginTop: '4px',
                }}
              >
                {/* Direct link button to entity */}
                <Link
                  href={alert.link}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    borderRadius: 'var(--r-field, 4px)',
                    border: '1px solid var(--navy, #25324f)',
                    backgroundColor: 'var(--paper, #ffffff)',
                    color: 'var(--navy-text, #25324f)',
                    textDecoration: 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Consulter
                </Link>

                {/* Mark as read button if unread */}
                {!alert.isRead ? (
                  <button
                    type="button"
                    onClick={() => void onMarkAsRead(alert.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      borderRadius: 'var(--r-field, 4px)',
                      border: '1px solid var(--line, #dfe2e2)',
                      backgroundColor: 'var(--badge-neutral-bg)',
                      color: 'var(--ink, #141414)',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    Marquer comme lu
                  </button>
                ) : (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '6px 10px',
                      fontSize: '12px',
                      color: 'var(--muted, #6b7280)',
                      fontWeight: 500,
                    }}
                  >
                    ✓ Lu
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 20px',
          borderTop: '1px solid var(--line, #dfe2e2)',
          backgroundColor: 'var(--badge-neutral-bg)',
          fontSize: '13px',
          color: 'var(--muted, #6b7280)',
        }}
      >
        <div>
          <span>{`Page ${page} sur ${totalPages}`}</span>
          <span style={{ margin: '0 8px' }}>•</span>
          <span>{`${total} alertes au total`}</span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            style={{
              padding: '5px 12px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: 'var(--r-field, 4px)',
              border: '1px solid var(--line, #dfe2e2)',
              backgroundColor: 'var(--paper, #ffffff)',
              color: 'var(--ink, #141414)',
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
              opacity: page <= 1 ? 0.5 : 1,
            }}
          >
            Précédent
          </button>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            style={{
              padding: '5px 12px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: 'var(--r-field, 4px)',
              border: '1px solid var(--line, #dfe2e2)',
              backgroundColor: 'var(--paper, #ffffff)',
              color: 'var(--ink, #141414)',
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              opacity: page >= totalPages ? 0.5 : 1,
            }}
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
}
