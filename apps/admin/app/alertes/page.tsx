'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AdminAlertItem,
  AdminAlertKpis,
  AdminAlertListResponse,
  AdminAlertPreferences,
  AdminAlertPreferencesPatch,
  AdminAlertSeverity,
  AdminAlertType,
} from '@revime/shared';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import {
  AlertsFilterToolbar,
  type AlertTypeFilter,
  type AlertSeverityFilter,
  type AlertReadFilter,
} from '../../components/AlertsFilterToolbar';
import { AlertsTable } from '../../components/AlertsTable';
import { AlertsKpiCards } from '../../components/AlertsKpiCards';
import { AlertsPreferencesCard } from '../../components/AlertsPreferencesCard';
import { AlertsSlaCard } from '../../components/AlertsSlaCard';

export interface AlertsPageProps {
  initialAlerts?: AdminAlertItem[];
  initialTotal?: number;
  initialKpis?: AdminAlertKpis | null;
  initialPreferences?: AdminAlertPreferences | null;
  initialType?: AlertTypeFilter;
  initialSeverity?: AlertSeverityFilter;
  initialIsRead?: AlertReadFilter;
  initialQ?: string;
  initialPage?: number;
}

export default function AlertsPage({
  initialAlerts,
  initialTotal = 0,
  initialKpis = null,
  initialPreferences = null,
  initialType = 'ALL',
  initialSeverity = 'ALL',
  initialIsRead = 'false',
  initialQ = '',
  initialPage = 1,
}: AlertsPageProps) {
  // Filter States
  const [type, setType] = useState<AlertTypeFilter>(initialType);
  const [severity, setSeverity] = useState<AlertSeverityFilter>(initialSeverity);
  const [isRead, setIsRead] = useState<AlertReadFilter>(initialIsRead);
  const [q, setQ] = useState<string>(initialQ);
  const [page, setPage] = useState<number>(initialPage);
  const limit = 20;

  // Data States
  const [alerts, setAlerts] = useState<AdminAlertItem[]>(initialAlerts ?? []);
  const [total, setTotal] = useState<number>(initialAlerts ? (initialTotal || initialAlerts.length) : 0);
  const [unreadCount, setUnreadCount] = useState<number>(initialKpis?.unreadTotal ?? 0);
  const [kpis, setKpis] = useState<AdminAlertKpis | null>(initialKpis);
  const [preferences, setPreferences] = useState<AdminAlertPreferences | null>(initialPreferences);

  // Status States
  const [loading, setLoading] = useState<boolean>(false);
  const [markingAllAsRead, setMarkingAllAsRead] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Skip first client fetch if initial data was supplied by SSR/test
  const skipFirstFetchRef = useRef<boolean>(initialAlerts !== undefined);

  // Fetch Alerts from API
  const fetchAlerts = useCallback(
    async (
      targetType: AlertTypeFilter,
      targetSeverity: AlertSeverityFilter,
      targetIsRead: AlertReadFilter,
      targetQ: string,
      targetPage: number
    ) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('page', String(targetPage));
        params.set('limit', String(limit));
        params.set('isRead', targetIsRead);
        if (targetType !== 'ALL') {
          params.set('type', targetType);
        }
        if (targetSeverity !== 'ALL') {
          params.set('severity', targetSeverity);
        }
        if (targetQ.trim()) {
          params.set('q', targetQ.trim());
        }

        const res = await fetch(`/api/proxy/admin/alerts?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Erreur HTTP ${res.status}`);
        }
        const data = (await res.json()) as AdminAlertListResponse;
        setAlerts(data.items);
        setTotal(data.total);
        setUnreadCount(data.unreadCount);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erreur lors du chargement des alertes';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [limit]
  );

  // Fetch KPIs
  const fetchKpis = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/admin/alerts/kpis');
      if (res.ok) {
        const data = (await res.json()) as AdminAlertKpis;
        setKpis(data);
        setUnreadCount(data.unreadTotal);
      }
    } catch {
      // Background KPI failure is non-blocking
    }
  }, []);

  // Fetch Preferences
  const fetchPreferences = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/admin/alerts/preferences');
      if (res.ok) {
        const data = (await res.json()) as AdminAlertPreferences;
        setPreferences(data);
      }
    } catch {
      // Background preferences failure is non-blocking
    }
  }, []);

  // Synchronize on filter change
  useEffect(() => {
    if (skipFirstFetchRef.current) {
      skipFirstFetchRef.current = false;
      return;
    }
    void fetchAlerts(type, severity, isRead, q, page);
  }, [fetchAlerts, type, severity, isRead, q, page]);

  // Initial load of KPIs and Preferences if not provided
  useEffect(() => {
    if (!initialKpis) {
      void fetchKpis();
    }
    if (!initialPreferences) {
      void fetchPreferences();
    }
  }, [fetchKpis, fetchPreferences, initialKpis, initialPreferences]);

  // Handle Mark All As Read
  const handleMarkAllAsRead = async () => {
    setMarkingAllAsRead(true);
    setError(null);
    try {
      const res = await fetch('/api/proxy/admin/alerts/mark-all-read', {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error(`Erreur lors du marquage : HTTP ${res.status}`);
      }
      // Update local alerts state to marked as read
      setAlerts((prev) =>
        prev.map((a) => ({
          ...a,
          isRead: true,
          readAt: a.readAt ?? new Date().toISOString(),
        }))
      );
      setUnreadCount(0);
      if (kpis) {
        setKpis({ ...kpis, unreadTotal: 0, criticalCount: 0 });
      }
      // If filtering by non lues only, refetch alerts
      if (isRead === 'false') {
        void fetchAlerts(type, severity, isRead, q, page);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur lors du marquage de toutes les alertes';
      setError(msg);
    } finally {
      setMarkingAllAsRead(false);
    }
  };

  // Handle Mark Single Alert As Read
  const handleMarkAsRead = async (alertId: string) => {
    try {
      const res = await fetch(`/api/proxy/admin/alerts/${encodeURIComponent(alertId)}/read`, {
        method: 'PATCH',
      });
      if (!res.ok) {
        throw new Error(`Erreur HTTP ${res.status}`);
      }
      const updated = (await res.json()) as AdminAlertItem;
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? updated : a)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      if (kpis) {
        setKpis({
          ...kpis,
          unreadTotal: Math.max(0, kpis.unreadTotal - 1),
          criticalCount:
            updated.severity === 'CRITICAL' ? Math.max(0, kpis.criticalCount - 1) : kpis.criticalCount,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur lors du marquage de l’alerte';
      setError(msg);
    }
  };

  // Handle Preferences update
  const handleUpdatePreferences = async (patch: AdminAlertPreferencesPatch) => {
    try {
      const res = await fetch('/api/proxy/admin/alerts/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        throw new Error(`Erreur HTTP ${res.status}`);
      }
      const updated = (await res.json()) as AdminAlertPreferences;
      setPreferences(updated);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Erreur lors de la mise à jour des préférences';
      setError(msg);
    }
  };

  return (
    <div className="page page--detail">
      {/* Breadcrumbs Navigation */}
      <Breadcrumbs
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Opérations', href: '/litiges' },
          { label: 'Alertes opérationnelles' },
        ]}
      />

      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
          marginTop: '16px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h1
            style={{
              margin: '0 0 6px 0',
              fontSize: '24px',
              fontWeight: 700,
              color: 'var(--ink, #141414)',
            }}
          >
            Alertes opérationnelles
          </h1>
          <p style={{ margin: 0, color: 'var(--muted, #6b7280)', fontSize: '15px' }}>
            Hub de surveillance des incidents opérationnels, litiges critiques, échecs de paiement et signalements.
          </p>
        </div>
      </div>

      {/* Error alert banner */}
      {error && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--r-field, 4px)',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--red-soft, #feedf0)',
            border: '1px solid var(--badge-danger-border)',
            color: 'var(--red-text, #bd0e26)',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '16px',
              padding: '0 4px',
            }}
            aria-label="Fermer le message"
          >
            ×
          </button>
        </div>
      )}

      {/* Responsive 2-column Detail Grid */}
      <div className="detail-grid">
        {/* Left Column (1.6fr): Filter Toolbar & Alerts Table */}
        <div data-testid="detail-grid-left">
          <AlertsFilterToolbar
            type={type}
            severity={severity}
            isRead={isRead}
            q={q}
            unreadCount={unreadCount}
            markingAllAsRead={markingAllAsRead}
            onTypeChange={(newType) => {
              setType(newType);
              setPage(1);
            }}
            onSeverityChange={(newSev) => {
              setSeverity(newSev);
              setPage(1);
            }}
            onIsReadChange={(newIsRead) => {
              setIsRead(newIsRead);
              setPage(1);
            }}
            onSearchChange={(newQ) => {
              setQ(newQ);
              setPage(1);
            }}
            onMarkAllAsRead={handleMarkAllAsRead}
          />

          <AlertsTable
            alerts={alerts}
            total={total}
            page={page}
            limit={limit}
            loading={loading}
            onPageChange={(newPage) => setPage(newPage)}
            onMarkAsRead={handleMarkAsRead}
          />
        </div>

        {/* Right Column (1.1fr): KPI Cards, Preferences Card, SLA Guidance Card */}
        <div data-testid="detail-grid-right">
          <AlertsKpiCards kpis={kpis} loading={loading} />

          <AlertsPreferencesCard
            preferences={preferences}
            onUpdate={handleUpdatePreferences}
          />

          <AlertsSlaCard />
        </div>
      </div>
    </div>
  );
}
