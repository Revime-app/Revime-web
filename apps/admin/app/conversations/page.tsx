'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type {
  AdminConversationDetailResponse,
  AdminConversationKpis,
  AdminConversationListResponse,
  AdminConversationStatusFilter,
  AdminConversationSummaryItem,
} from '@revime/shared';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { ConversationsKpiCards } from '../../components/ConversationsKpiCards';
import { ConversationsFilterToolbar } from '../../components/ConversationsFilterToolbar';
import { ConversationsThreadList } from '../../components/ConversationsThreadList';
import { ConversationMessageHistory } from '../../components/ConversationMessageHistory';

export interface ConversationsPageProps {
  initialConversations?: AdminConversationSummaryItem[];
  initialTotal?: number;
  initialKpis?: AdminConversationKpis | null;
  initialSelectedConversation?: AdminConversationDetailResponse | null;
  initialId?: string | null;
  initialQ?: string;
  initialStatus?: AdminConversationStatusFilter;
  initialHasDispute?: boolean;
  initialHasReport?: boolean;
  initialPage?: number;
}

export function ConversationsHubView({
  initialConversations,
  initialTotal,
  initialKpis = null,
  initialSelectedConversation = null,
  initialId = null,
  initialQ = '',
  initialStatus = 'all',
  initialHasDispute = false,
  initialHasReport = false,
  initialPage = 1,
}: ConversationsPageProps) {
  const searchParams = useSearchParams();

  // URL search params resolution
  const paramId = searchParams?.get('id') ?? initialId;
  const paramQ = searchParams?.get('q') ?? initialQ;
  const paramStatus = (searchParams?.get('status') as AdminConversationStatusFilter) ?? initialStatus;
  const paramDispute = searchParams?.get('hasDispute') === 'true' || initialHasDispute;
  const paramReport = searchParams?.get('hasReport') === 'true' || initialHasReport;
  const paramPage = Number(searchParams?.get('page')) || initialPage;

  // Filter States
  const [q, setQ] = useState<string>(paramQ);
  const [status, setStatus] = useState<AdminConversationStatusFilter>(paramStatus);
  const [hasDispute, setHasDispute] = useState<boolean>(paramDispute);
  const [hasReport, setHasReport] = useState<boolean>(paramReport);
  const [page, setPage] = useState<number>(paramPage);
  const limit = 20;

  // Data States
  const [conversations, setConversations] = useState<AdminConversationSummaryItem[]>(
    initialConversations ?? []
  );
  const [total, setTotal] = useState<number>(
    initialTotal ?? (initialConversations ? initialConversations.length : 0)
  );
  const [kpis, setKpis] = useState<AdminConversationKpis | null>(initialKpis);

  const initialEffectiveSelectedId =
    paramId ??
    initialSelectedConversation?.id ??
    (initialConversations && initialConversations.length > 0 ? initialConversations[0].id : null);

  const [selectedId, setSelectedId] = useState<string | null>(initialEffectiveSelectedId);
  const [selectedConversation, setSelectedConversation] =
    useState<AdminConversationDetailResponse | null>(initialSelectedConversation);

  // Status & loading
  const [loadingList, setLoadingList] = useState<boolean>(false);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Prevent double fetch when SSR/test initial data is provided
  const skipFirstFetchRef = useRef<boolean>(initialConversations !== undefined);

  // Fetch conversations list
  const fetchConversations = useCallback(
    async (
      targetQ: string,
      targetStatus: AdminConversationStatusFilter,
      targetDispute: boolean,
      targetReport: boolean,
      targetPage: number
    ) => {
      setLoadingList(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('page', String(targetPage));
        params.set('limit', String(limit));
        if (targetQ.trim()) params.set('q', targetQ.trim());
        if (targetStatus !== 'all') params.set('status', targetStatus);
        if (targetDispute) params.set('hasDispute', 'true');
        if (targetReport) params.set('hasReport', 'true');

        const res = await fetch(`/api/proxy/admin/conversations?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Erreur HTTP ${res.status}`);
        }
        const data = (await res.json()) as AdminConversationListResponse;
        setConversations(data.items);
        setTotal(data.total);
        if (data.kpis) {
          setKpis(data.kpis);
        }

        // Auto-select first thread if nothing selected or current selected no longer in list
        if (data.items.length > 0) {
          setSelectedId((curr) => {
            const exists = data.items.some((it) => it.id === curr);
            return exists ? curr : data.items[0].id;
          });
        } else {
          setSelectedId(null);
          setSelectedConversation(null);
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Erreur lors du chargement des conversations';
        setError(msg);
      } finally {
        setLoadingList(false);
      }
    },
    [limit]
  );

  // Fetch thread detail
  const fetchDetail = useCallback(async (threadId: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/proxy/admin/conversations/${encodeURIComponent(threadId)}`);
      if (!res.ok) {
        throw new Error(`Erreur HTTP ${res.status}`);
      }
      const data = (await res.json()) as AdminConversationDetailResponse;
      setSelectedConversation(data);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Erreur lors du chargement de la conversation';
      setError(msg);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // Initial and reactive list fetching
  useEffect(() => {
    if (skipFirstFetchRef.current) {
      skipFirstFetchRef.current = false;
      return;
    }
    fetchConversations(q, status, hasDispute, hasReport, page);
  }, [q, status, hasDispute, hasReport, page, fetchConversations]);

  // Reactive detail fetching upon selectedId change
  useEffect(() => {
    if (!selectedId) {
      setSelectedConversation(null);
      return;
    }
    // If selected conversation already matches selectedId (e.g. from initial props), skip fetch
    if (selectedConversation && selectedConversation.id === selectedId) {
      return;
    }
    fetchDetail(selectedId);
  }, [selectedId, selectedConversation, fetchDetail]);

  // Moderation: Close conversation
  const handleCloseConversation = async (id: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/proxy/admin/conversations/${encodeURIComponent(id)}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`Échec de la fermeture (HTTP ${res.status})`);
      }
      // Refresh current detail and list
      await Promise.all([
        fetchDetail(id),
        fetchConversations(q, status, hasDispute, hasReport, page),
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur de clôture';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  // Moderation: Reopen conversation
  const handleReopenConversation = async (id: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/proxy/admin/conversations/${encodeURIComponent(id)}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`Échec de la réouverture (HTTP ${res.status})`);
      }
      // Refresh current detail and list
      await Promise.all([
        fetchDetail(id),
        fetchConversations(q, status, hasDispute, hasReport, page),
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur de réouverture';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="page page--detail">
      {/* Breadcrumb Trail */}
      <Breadcrumbs
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Opérations' },
          { label: 'Conversations' },
        ]}
      />

      {/* Header section */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          margin: '16px 0 20px',
        }}
      >
        <div>
          <h1
            style={{
              margin: '0 0 4px',
              fontSize: '24px',
              fontWeight: 700,
              color: 'var(--ink, #141414)',
            }}
          >
            Conversations
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--ink-muted, #666666)' }}>
            Supervision, historique des échanges client-réparateur et modération.
          </p>
        </div>
      </div>

      {/* Error notification banner */}
      {error && (
        <div
          role="alert"
          style={{
            background: 'var(--badge-danger-bg)',
            border: '1px solid var(--badge-danger-border)',
            color: 'var(--navy-text, #f61b39)',
            borderRadius: '8px',
            padding: '10px 14px',
            marginBottom: '16px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Fermer l'alerte"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '16px',
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Responsive 2-Pane Detail Grid */}
      <div
        className="detail-grid"
        style={{
          gridTemplateColumns: 'minmax(340px, 1.1fr) minmax(0, 1.6fr)',
          alignItems: 'start',
        }}
      >
        {/* Left Column (1.1fr): KPIs, Toolbar, Thread Directory */}
        <div data-testid="detail-grid-left" style={{ minWidth: 0 }}>
          <ConversationsKpiCards kpis={kpis} loading={loadingList} />

          <ConversationsFilterToolbar
            q={q}
            status={status}
            hasDispute={hasDispute}
            hasReport={hasReport}
            onSearchChange={(newQ) => {
              setQ(newQ);
              setPage(1);
            }}
            onStatusChange={(newStatus) => {
              setStatus(newStatus);
              setPage(1);
            }}
            onHasDisputeChange={(newHasDispute) => {
              setHasDispute(newHasDispute);
              setPage(1);
            }}
            onHasReportChange={(newHasReport) => {
              setHasReport(newHasReport);
              setPage(1);
            }}
            onReset={() => {
              setQ('');
              setStatus('all');
              setHasDispute(false);
              setHasReport(false);
              setPage(1);
            }}
          />

          <ConversationsThreadList
            threads={conversations}
            selectedId={selectedId}
            onSelectThread={(id) => {
              setSelectedId(id);
            }}
            page={page}
            total={total}
            limit={limit}
            onPageChange={(newPage) => setPage(newPage)}
            loading={loadingList}
          />
        </div>

        {/* Right Column (1.6fr): Active Conversation & Message History */}
        <div data-testid="detail-grid-right" style={{ minWidth: 0 }}>
          <ConversationMessageHistory
            conversation={selectedConversation}
            loading={loadingDetail}
            actionLoading={actionLoading}
            onCloseConversation={handleCloseConversation}
            onReopenConversation={handleReopenConversation}
          />
        </div>
      </div>
    </div>
  );
}

export default function ConversationsPage(props: ConversationsPageProps) {
  return (
    <Suspense
      fallback={
        <div className="page page--detail" style={{ padding: '32px 16px' }}>
          Chargement du hub conversations...
        </div>
      }
    >
      <ConversationsHubView {...props} />
    </Suspense>
  );
}
