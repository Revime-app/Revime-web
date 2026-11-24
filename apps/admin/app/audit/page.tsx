'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type {
  AdminAuditDetailedEntry,
  AdminAuditKpis,
  AdminAuditListResponse,
} from '@revime/shared';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import {
  AuditFilterToolbar,
  type AuditFilterState,
} from '../../components/AuditFilterToolbar';
import { AuditLogTable } from '../../components/AuditLogTable';
import { AuditKpiCards } from '../../components/AuditKpiCards';
import { AuditExportCard } from '../../components/AuditExportCard';
import { AuditDetailDrawer } from '../../components/AuditDetailDrawer';

export interface AuditPageProps {
  initialItems?: AdminAuditDetailedEntry[] | null;
  initialTotal?: number | null;
  initialPage?: number;
  initialPageSize?: number;
  initialTotalPages?: number | null;
  initialKpis?: AdminAuditKpis | null;
  initialSelectedEntry?: AdminAuditDetailedEntry | null;
  initialDrawerOpen?: boolean;
}

export default function AuditPage({
  initialItems = null,
  initialTotal = null,
  initialPage = 1,
  initialPageSize = 25,
  initialTotalPages = null,
  initialKpis = null,
  initialSelectedEntry = null,
  initialDrawerOpen = false,
}: AuditPageProps) {
  // Filters & Pagination State
  const [filters, setFilters] = useState<AuditFilterState>({});
  const [page, setPage] = useState<number>(initialPage);
  const pageSize = initialPageSize;

  // Data State
  const [items, setItems] = useState<AdminAuditDetailedEntry[]>(initialItems ?? []);
  const [total, setTotal] = useState<number>(initialTotal ?? initialItems?.length ?? 0);
  const [totalPages, setTotalPages] = useState<number>(
    initialTotalPages ??
      (initialTotal !== null && initialTotal !== undefined
        ? Math.ceil(initialTotal / initialPageSize) || 1
        : initialItems && initialItems.length > 0
          ? Math.ceil(initialItems.length / initialPageSize) || 1
          : 1)
  );
  const [loading, setLoading] = useState(false);

  // KPIs State
  const [kpis, setKpis] = useState<AdminAuditKpis | null>(initialKpis);
  const [kpisLoading, setKpisLoading] = useState(false);

  // Export & Drawer State
  const [exporting, setExporting] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<AdminAuditDetailedEntry | null>(
    initialSelectedEntry
  );
  const [drawerOpen, setDrawerOpen] = useState(initialDrawerOpen);

  // Sync initial props if updated externally
  useEffect(() => {
    if (initialItems !== null && initialItems !== undefined) {
      setItems(initialItems);
    }
  }, [initialItems]);

  useEffect(() => {
    if (initialTotal !== null && initialTotal !== undefined) {
      setTotal(initialTotal);
    }
  }, [initialTotal]);

  useEffect(() => {
    if (initialTotalPages !== null && initialTotalPages !== undefined) {
      setTotalPages(initialTotalPages);
    }
  }, [initialTotalPages]);

  useEffect(() => {
    if (initialKpis !== null && initialKpis !== undefined) {
      setKpis(initialKpis);
    }
  }, [initialKpis]);

  useEffect(() => {
    if (initialSelectedEntry !== undefined) {
      setSelectedEntry(initialSelectedEntry);
    }
  }, [initialSelectedEntry]);

  useEffect(() => {
    if (initialDrawerOpen !== undefined) {
      setDrawerOpen(initialDrawerOpen);
    }
  }, [initialDrawerOpen]);

  // Fetch Audit Log entries with filters and pagination
  const fetchAuditLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(pageSize));
      if (filters.q?.trim()) params.set('q', filters.q.trim());
      if (filters.domain) params.set('domain', filters.domain);
      if (filters.action) params.set('action', filters.action);
      if (filters.statusFamily) params.set('statusFamily', filters.statusFamily);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);

      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/proxy/admin/audit${qs}`);
      if (res.ok) {
        const data = (await res.json()) as AdminAuditListResponse;
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
      }
    } catch {
      // Network error handled silently
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize]);

  // Fetch KPIs
  const fetchKpis = useCallback(async () => {
    setKpisLoading(true);
    try {
      const res = await fetch('/api/proxy/admin/audit/kpis');
      if (res.ok) {
        const data = (await res.json()) as AdminAuditKpis;
        setKpis(data);
      }
    } catch {
      // Network error handled silently
    } finally {
      setKpisLoading(false);
    }
  }, []);

  // Initial load when not provided via props
  useEffect(() => {
    if (initialItems === null || initialItems === undefined) {
      void fetchAuditLogs();
    }
  }, [fetchAuditLogs, initialItems]);

  useEffect(() => {
    if (initialKpis === null || initialKpis === undefined) {
      void fetchKpis();
    }
  }, [fetchKpis, initialKpis]);

  // Filter change & reset handlers
  const handleFilterChange = (nextFilters: AuditFilterState) => {
    setFilters(nextFilters);
    setPage(1);
  };

  const handleFilterReset = () => {
    setFilters({});
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  // Inspect entry handler
  const handleInspect = (entry: AdminAuditDetailedEntry) => {
    setSelectedEntry(entry);
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
  };

  // Export CSV handler
  const handleExport = () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (filters.q?.trim()) params.set('q', filters.q.trim());
      if (filters.domain) params.set('domain', filters.domain);
      if (filters.action) params.set('action', filters.action);
      if (filters.statusFamily) params.set('statusFamily', filters.statusFamily);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);

      const qs = params.toString() ? `?${params.toString()}` : '';
      const exportUrl = `/api/proxy/admin/audit/export${qs}`;

      if (typeof window !== 'undefined') {
        window.location.href = exportUrl;
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="page page--detail">
      {/* Breadcrumbs Navigation */}
      <Breadcrumbs
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Sécurité', href: '/securite' },
          { label: "Journal d'audit" },
        ]}
      />

      {/* Page Header */}
      <div
        style={{
          marginTop: '16px',
          marginBottom: '24px',
        }}
      >
        <h1
          style={{
            margin: '0 0 6px 0',
            fontSize: '24px',
            fontWeight: 700,
            color: 'var(--ink, #141414)',
          }}
        >
          Journal d'audit
        </h1>
        <p style={{ margin: 0, color: 'var(--muted, #6b7280)', fontSize: '15px' }}>
          Consultez, filtrez et exportez l'historique complet des actions administratives et des événements de sécurité.
        </p>
      </div>

      {/* Main 2-column Detail Grid */}
      <div className="detail-grid">
        {/* Left Column (1.6fr): Filter Toolbar & Audit Log Table */}
        <div data-testid="detail-grid-left">
          <AuditFilterToolbar
            filters={filters}
            onChange={handleFilterChange}
            onReset={handleFilterReset}
            loading={loading}
          />

          <AuditLogTable
            items={items}
            total={total}
            page={page}
            pageSize={pageSize}
            totalPages={totalPages}
            loading={loading}
            onPageChange={handlePageChange}
            onInspect={handleInspect}
          />
        </div>

        {/* Right Column (1.1fr): KPI Cards & Export Card */}
        <div data-testid="detail-grid-right">
          <AuditKpiCards kpis={kpis} loading={kpisLoading} />

          <AuditExportCard
            totalMatching={total}
            onExport={handleExport}
            exporting={exporting}
          />
        </div>
      </div>

      {/* Detail Slide-over Drawer */}
      <AuditDetailDrawer
        entry={selectedEntry}
        isOpen={drawerOpen}
        onClose={handleCloseDrawer}
      />
    </div>
  );
}
