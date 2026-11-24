'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { alertTypeIcon } from '../lib/alert-type-icons';
import { Icon } from './Icon';
import {
  ADMIN_ALERT_TYPE_LABELS,
  timeAgoLabel,
  type AdminAlertItem,
  type AdminAlertListResponse,
  type AdminAlertSeverity,
} from '@revime/shared';

export const ALERT_BELL_POLL_INTERVAL_MS = 30_000;

/**
 * API Client helpers for Admin Alert Bell actions
 */
export async function fetchUnreadAlertsCount(fetchFn: typeof fetch = fetch): Promise<number> {
  const res = await fetchFn('/api/proxy/admin/alerts/unread-count');
  if (!res.ok) {
    throw new Error(`Failed to fetch unread count: ${res.status}`);
  }
  const data = (await res.json()) as { unreadCount: number };
  return typeof data?.unreadCount === 'number' ? data.unreadCount : 0;
}

export async function fetchLatestUnreadAlerts(
  limit = 5,
  fetchFn: typeof fetch = fetch
): Promise<AdminAlertListResponse> {
  const res = await fetchFn(`/api/proxy/admin/alerts?isRead=false&limit=${limit}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch alerts: ${res.status}`);
  }
  return (await res.json()) as AdminAlertListResponse;
}

export async function markAlertAsRead(
  alertId: string,
  fetchFn: typeof fetch = fetch
): Promise<AdminAlertItem> {
  const res = await fetchFn(`/api/proxy/admin/alerts/${encodeURIComponent(alertId)}/read`, {
    method: 'PATCH',
  });
  if (!res.ok) {
    throw new Error(`Failed to mark alert as read: ${res.status}`);
  }
  return (await res.json()) as AdminAlertItem;
}

export async function markAllAlertsAsRead(
  fetchFn: typeof fetch = fetch
): Promise<{ count: number }> {
  const res = await fetchFn('/api/proxy/admin/alerts/mark-all-read', {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error(`Failed to mark all alerts as read: ${res.status}`);
  }
  return (await res.json()) as { count: number };
}

export interface AdminAlertBellProps {
  initialUnreadCount?: number;
  initialAlerts?: AdminAlertItem[];
  initialOpen?: boolean;
  pollIntervalMs?: number;
  onCountChange?: (count: number) => void;
  onMarkAsRead?: (alertId: string) => Promise<void> | void;
  onMarkAllAsRead?: () => Promise<void> | void;
}

export const getSeverityStyle = (severity: AdminAlertSeverity): React.CSSProperties => {
  switch (severity) {
    case 'CRITICAL':
      return {
        color: 'var(--badge-danger-text)',
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

/**
 * Feature F7 / Task 4: Interactive Admin Alert Bell Popover
 * - Live 30-second polling (`/api/proxy/admin/alerts/unread-count`)
 * - Window focus refetch
 * - Unread count pill badge (`var(--red, #f61b39)`: `--accent` is navy in the admin, and the charte makes the counters Rouge Punch)
 * - Popover preview of latest 5 unread alerts with category icons, severity badges, quick mark-as-read
 * - Full compliance with Revime brand palette & zero black buttons invariant
 */
export function AdminAlertBell({
  initialUnreadCount = 0,
  initialAlerts,
  initialOpen = false,
  pollIntervalMs = ALERT_BELL_POLL_INTERVAL_MS,
  onCountChange,
  onMarkAsRead,
  onMarkAllAsRead,
}: AdminAlertBellProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [alerts, setAlerts] = useState<AdminAlertItem[]>(initialAlerts ?? []);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch unread count from proxy API
  const fetchCount = useCallback(async () => {
    try {
      const count = await fetchUnreadAlertsCount();
      setUnreadCount(count);
      onCountChange?.(count);
    } catch {
      // background polling error - silent
    }
  }, [onCountChange]);

  // Fetch latest 5 unread alerts
  const fetchAlerts = useCallback(async () => {
    setLoadingAlerts(true);
    try {
      const data = await fetchLatestUnreadAlerts(5);
      setAlerts(data.items ?? []);
      if (typeof data.unreadCount === 'number') {
        setUnreadCount(data.unreadCount);
        onCountChange?.(data.unreadCount);
      }
    } catch {
      // background fetch error - silent
    } finally {
      setLoadingAlerts(false);
    }
  }, [onCountChange]);

  // Live polling effect
  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchCount, pollIntervalMs]);

  // Focus refetch effect
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleFocus = () => {
      fetchCount();
      if (isOpen) {
        fetchAlerts();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchCount, fetchAlerts, isOpen]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Click outside listener
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOpen = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen && !initialAlerts) {
      fetchAlerts();
    }
  };

  const handleMarkAsRead = async (alertId: string) => {
    try {
      if (onMarkAsRead) {
        await onMarkAsRead(alertId);
      } else {
        await markAlertAsRead(alertId);
      }
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      setUnreadCount((prev) => {
        const updated = Math.max(0, prev - 1);
        onCountChange?.(updated);
        return updated;
      });
    } catch {
      // mark as read failure
    }
  };

  const handleMarkAllAsRead = async () => {
    setIsMarkingAll(true);
    try {
      if (onMarkAllAsRead) {
        await onMarkAllAsRead();
      } else {
        await markAllAlertsAsRead();
      }
      setAlerts([]);
      setUnreadCount(0);
      onCountChange?.(0);
    } catch {
      // mark all as read failure
    } finally {
      setIsMarkingAll(false);
    }
  };

  const displayedAlerts = alerts.slice(0, 5);

  return (
    <div
      ref={containerRef}
      className="admin-alert-bell"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        marginLeft: 'auto',
      }}
    >
      <button
        type="button"
        className="admin-alert-bell__trigger"
        onClick={toggleOpen}
        aria-label="Alertes opérationnelles"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="admin-alert-bell-popover"
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '38px',
          height: '38px',
          borderRadius: 'var(--r-field, 6px)',
          border: '1px solid var(--line, #dfe2e2)',
          backgroundColor: isOpen ? 'var(--navy-soft)' : 'transparent',
          color: 'var(--navy-text, #25324f)',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="admin-alert-bell__icon"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unreadCount > 0 && (
          <span
            className="admin-alert-bell__badge"
            data-testid="admin-alert-bell-badge"
            style={{
              position: 'absolute',
              top: '-5px',
              right: '-5px',
              backgroundColor: 'var(--red, #f61b39)',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 700,
              lineHeight: 1,
              padding: '2px 5px',
              borderRadius: '9999px',
              minWidth: '18px',
              textAlign: 'center',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          id="admin-alert-bell-popover"
          className="admin-alert-bell__popover"
          role="dialog"
          aria-label="Alertes opérationnelles"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '380px',
            maxWidth: '90vw',
            backgroundColor: 'var(--paper, #ffffff)',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
            zIndex: 50,
            overflow: 'hidden',
          }}
        >
          {/* Popover Header */}
          <div
            className="admin-alert-bell__header"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid var(--line, #dfe2e2)',
              backgroundColor: 'var(--badge-neutral-bg)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '13.5px',
                  fontWeight: 700,
                  color: 'var(--ink, #141414)',
                }}
              >
                Alertes opérationnelles
              </span>
              <span
                style={{
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: 'var(--muted, #6b7280)',
                }}
              >
                ({unreadCount})
              </span>
            </div>

            <button
              type="button"
              className="admin-alert-bell__mark-all-btn"
              onClick={handleMarkAllAsRead}
              disabled={unreadCount === 0 || isMarkingAll}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px 6px',
                fontSize: '12px',
                fontWeight: 600,
                color: unreadCount === 0 ? 'var(--muted, #6b7280)' : 'var(--navy-text, #25324f)',
                cursor: unreadCount === 0 ? 'not-allowed' : 'pointer',
                textDecoration: unreadCount === 0 ? 'none' : 'underline',
                borderRadius: '4px',
              }}
            >
              {isMarkingAll ? 'En cours...' : 'Tout marquer comme lu'}
            </button>
          </div>

          {/* Alerts List */}
          <div className="admin-alert-bell__content" style={{ maxHeight: '380px', overflowY: 'auto' }}>
            {loadingAlerts && alerts.length === 0 ? (
              <div
                style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  fontSize: '13px',
                  color: 'var(--muted, #6b7280)',
                }}
              >
                Chargement des alertes...
              </div>
            ) : displayedAlerts.length === 0 ? (
              <div
                className="admin-alert-bell__empty"
                data-testid="admin-alert-bell-empty"
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--muted, #6b7280)',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: '22px',
                    color: 'var(--badge-success-text)',
                    marginBottom: '6px',
                  }}
                  aria-hidden="true"
                >
                  ✓
                </span>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 500 }}>
                  Aucune alerte non lue
                </p>
              </div>
            ) : (
              <ul
                className="admin-alert-bell__list"
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                }}
              >
                {displayedAlerts.map((alert) => {
                  const typeIcon = alertTypeIcon(alert.type);
                  const relTime = timeAgoLabel(alert.createdAt, new Date()) || 'Récemment';
                  const severityStyle = getSeverityStyle(alert.severity);

                  return (
                    <li
                      key={alert.id}
                      className="admin-alert-bell__item"
                      style={{
                        position: 'relative',
                        borderBottom: '1px solid var(--line, #dfe2e2)',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <Link
                        href={alert.link}
                        className="admin-alert-bell__item-link"
                        onClick={() => setIsOpen(false)}
                        style={{
                          display: 'flex',
                          gap: '12px',
                          padding: '12px 16px 6px 16px',
                          textDecoration: 'none',
                          color: 'inherit',
                          alignItems: 'flex-start',
                        }}
                      >
                        <span
                          className="admin-alert-bell__item-icon"
                          aria-hidden="true"
                          style={{ fontSize: '18px', lineHeight: 1, marginTop: '2px' }}
                        >
                          <Icon as={typeIcon} />
                        </span>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                              marginBottom: '3px',
                            }}
                          >
                            <span
                              className="admin-alert-bell__item-title"
                              style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                color: 'var(--ink, #141414)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {alert.title}
                            </span>
                            <span
                              className="admin-alert-bell__severity-badge"
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: '4px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                                flexShrink: 0,
                                ...severityStyle,
                              }}
                            >
                              {alert.severity}
                            </span>
                          </div>

                          <p
                            className="admin-alert-bell__item-message"
                            style={{
                              fontSize: '12px',
                              color: 'var(--muted, #6b7280)',
                              margin: 0,
                              lineHeight: 1.35,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {alert.message}
                          </p>
                        </div>
                      </Link>

                      <div
                        className="admin-alert-bell__item-actions"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          padding: '0 16px 10px 46px',
                        }}
                      >
                        <span
                          className="admin-alert-bell__item-time"
                          style={{
                            fontSize: '11px',
                            color: 'var(--muted, #6b7280)',
                          }}
                        >
                          {relTime}
                        </span>

                        <button
                          type="button"
                          className="admin-alert-bell__item-mark-btn"
                          aria-label="Marquer comme lu"
                          title="Marquer comme lu"
                          onClick={() => handleMarkAsRead(alert.id)}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--line, #dfe2e2)',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: 'var(--navy-text, #25324f)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            transition: 'all 0.1s ease',
                          }}
                        >
                          ✓ Marquer comme lu
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Popover Footer */}
          <div
            className="admin-alert-bell__footer"
            style={{
              padding: '10px 16px',
              borderTop: '1px solid var(--line, #dfe2e2)',
              backgroundColor: 'var(--badge-neutral-bg)',
              textAlign: 'center',
            }}
          >
            <Link
              href="/alertes"
              className="admin-alert-bell__all-link"
              onClick={() => setIsOpen(false)}
              style={{
                fontSize: '12.5px',
                fontWeight: 600,
                color: 'var(--navy-text, #25324f)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              Voir toutes les alertes (→ /alertes)
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
