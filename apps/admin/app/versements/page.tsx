'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type {
  AdminPayoutListItem,
  AdminIncompleteConnectAccount,
  AdminPayoutKpis,
  AdminPayoutListResponse,
  AdminIncompleteAccountsResponse,
} from '@revime/shared';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import {
  PayoutsFilterToolbar,
  type PayoutFilterState,
} from '../../components/PayoutsFilterToolbar';
import { PayoutsTable } from '../../components/PayoutsTable';
import { IncompleteConnectAccountsTable } from '../../components/IncompleteConnectAccountsTable';
import { PayoutsKpiCards } from '../../components/PayoutsKpiCards';
import { PayoutsExportCard } from '../../components/PayoutsExportCard';
import { PayoutRetryModal } from '../../components/PayoutRetryModal';
import { ConnectRemindModal } from '../../components/ConnectRemindModal';
import { PayoutDetailDrawer } from '../../components/PayoutDetailDrawer';
import { useAdminMe } from '../../components/AdminGate';
import { hasPermission } from '../../lib/permissions';
import { ShieldCheck } from 'lucide-react';
import { Icon } from '../../components/Icon';

export type VersementsTab = 'payouts' | 'incomplete-accounts';

export interface VersementsPageProps {
  initialTab?: VersementsTab;
  initialPayouts?: AdminPayoutListItem[] | null;
  initialIncompleteAccounts?: AdminIncompleteConnectAccount[] | null;
  initialKpis?: AdminPayoutKpis | null;
  initialTotalPayouts?: number;
  initialTotalIncomplete?: number;
  initialRetryModalOpen?: boolean;
  initialRetryItem?: AdminPayoutListItem | null;
  initialRemindModalOpen?: boolean;
  initialRemindAccount?: AdminIncompleteConnectAccount | null;
  initialDrawerOpen?: boolean;
  initialSelectedItem?: AdminPayoutListItem | null;
}

const DEFAULT_FILTERS: PayoutFilterState = {
  status: 'ALL',
  period: 'all',
};

export default function VersementsPage({
  initialTab = 'payouts',
  initialPayouts = null,
  initialIncompleteAccounts = null,
  initialKpis = null,
  initialTotalPayouts,
  initialTotalIncomplete,
  initialRetryModalOpen = false,
  initialRetryItem = null,
  initialRemindModalOpen = false,
  initialRemindAccount = null,
  initialDrawerOpen = false,
  initialSelectedItem = null,
}: VersementsPageProps) {
  // Navigation / Tab state
  const [activeTab, setActiveTab] = useState<VersementsTab>(initialTab);

  // Tab 1 (Journal des versements) data state
  const [payouts, setPayouts] = useState<AdminPayoutListItem[]>(initialPayouts ?? []);
  const [totalPayouts, setTotalPayouts] = useState<number>(
    initialTotalPayouts ?? (initialPayouts?.length ?? 0)
  );
  const [payoutsPage, setPayoutsPage] = useState(1);
  const payoutsPageSize = 25;
  const [payoutsLoading, setPayoutsLoading] = useState(false);
  const [payoutFilters, setPayoutFilters] = useState<PayoutFilterState>(DEFAULT_FILTERS);

  // Tab 2 (Comptes Connect incomplets) data state
  const [incompleteAccounts, setIncompleteAccounts] = useState<AdminIncompleteConnectAccount[]>(
    initialIncompleteAccounts ?? []
  );
  const [totalIncomplete, setTotalIncomplete] = useState<number>(
    initialTotalIncomplete ?? (initialIncompleteAccounts?.length ?? 0)
  );
  const [incompletePage, setIncompletePage] = useState(1);
  const incompletePageSize = 25;
  const [incompleteLoading, setIncompleteLoading] = useState(false);
  const [incompleteSearch, setIncompleteSearch] = useState('');
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // Global KPIs state
  const [kpis, setKpis] = useState<AdminPayoutKpis | null>(initialKpis);
  const [kpisLoading, setKpisLoading] = useState(false);

  // Export state
  const [exporting, setExporting] = useState(false);

  // Feedback banner state
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Modal & Drawer states
  const [retryModalOpen, setRetryModalOpen] = useState(initialRetryModalOpen);
  const [retryItem, setRetryItem] = useState<AdminPayoutListItem | null>(initialRetryItem);
  const [retrying, setRetrying] = useState(false);

  const [remindModalOpen, setRemindModalOpen] = useState(initialRemindModalOpen);
  const [remindAccount, setRemindAccount] = useState<AdminIncompleteConnectAccount | null>(
    initialRemindAccount
  );
  const [reminding, setReminding] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(initialDrawerOpen);
  const [selectedItem, setSelectedItem] = useState<AdminPayoutListItem | null>(initialSelectedItem);

  const adminMe = useAdminMe();
  const [fiscalReminding, setFiscalReminding] = useState(false);

  const handleTriggerFiscalReminders = async () => {
    if (
      !window.confirm(
        'Déclencher la campagne de relances fiscales DAC7 pour tous les réparateurs concernés ?'
      )
    ) {
      return;
    }
    setFiscalReminding(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/proxy/admin/payouts/fiscal/remind', {
        method: 'POST',
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Échec du déclenchement des relances fiscales.');
      }
      const data: { scanned: number; reminded1: number; reminded2: number; failed: number } = await res.json();
      const sent = data.reminded1 + data.reminded2;
      const failedNote = data.failed > 0 ? `, ${data.failed} non envoyée(s), réessayée(s) au prochain passage` : '';
      setFeedback({
        type: data.failed > 0 ? 'error' : 'success',
        message: `Campagne de relances fiscales exécutée : ${sent} relance(s) envoyée(s) (${data.scanned} réparateurs évalués${failedNote}).`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: (err instanceof Error && err.message) || 'Une erreur est survenue lors des relances fiscales.',
      });
    } finally {
      setFiscalReminding(false);
    }
  };

  // Sync initial props if changed externally
  useEffect(() => {
    if (initialTab !== undefined) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (initialPayouts !== null && initialPayouts !== undefined) {
      setPayouts(initialPayouts);
      setTotalPayouts(initialTotalPayouts ?? initialPayouts.length);
    }
  }, [initialPayouts, initialTotalPayouts]);

  useEffect(() => {
    if (initialIncompleteAccounts !== null && initialIncompleteAccounts !== undefined) {
      setIncompleteAccounts(initialIncompleteAccounts);
      setTotalIncomplete(initialTotalIncomplete ?? initialIncompleteAccounts.length);
    }
  }, [initialIncompleteAccounts, initialTotalIncomplete]);

  useEffect(() => {
    if (initialKpis !== null && initialKpis !== undefined) {
      setKpis(initialKpis);
    }
  }, [initialKpis]);

  useEffect(() => {
    if (initialRetryModalOpen !== undefined) {
      setRetryModalOpen(initialRetryModalOpen);
    }
    if (initialRetryItem !== undefined) {
      setRetryItem(initialRetryItem);
    }
  }, [initialRetryModalOpen, initialRetryItem]);

  useEffect(() => {
    if (initialRemindModalOpen !== undefined) {
      setRemindModalOpen(initialRemindModalOpen);
    }
    if (initialRemindAccount !== undefined) {
      setRemindAccount(initialRemindAccount);
    }
  }, [initialRemindModalOpen, initialRemindAccount]);

  useEffect(() => {
    if (initialDrawerOpen !== undefined) {
      setDrawerOpen(initialDrawerOpen);
    }
    if (initialSelectedItem !== undefined) {
      setSelectedItem(initialSelectedItem);
    }
  }, [initialDrawerOpen, initialSelectedItem]);

  // Fetch Payouts list
  const fetchPayouts = useCallback(
    async (filters: PayoutFilterState, page: number) => {
      setPayoutsLoading(true);
      try {
        const params = new URLSearchParams();
        if (filters.q?.trim()) params.set('q', filters.q.trim());
        if (filters.status && filters.status !== 'ALL') params.set('status', filters.status);
        if (filters.period && filters.period !== 'all') params.set('period', filters.period);
        params.set('page', String(page));
        params.set('limit', String(payoutsPageSize));

        const res = await fetch(`/api/proxy/admin/payouts?${params.toString()}`);
        if (res.ok) {
          const data = (await res.json()) as AdminPayoutListResponse;
          setPayouts(data.items ?? []);
          setTotalPayouts(data.total ?? 0);
        }
      } catch {
        // Network error handled silently
      } finally {
        setPayoutsLoading(false);
      }
    },
    [payoutsPageSize]
  );

  // Fetch Incomplete Connect accounts list
  const fetchIncompleteAccounts = useCallback(
    async (query: string, page: number) => {
      setIncompleteLoading(true);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set('q', query.trim());
        params.set('page', String(page));
        params.set('limit', String(incompletePageSize));

        const res = await fetch(`/api/proxy/admin/payouts/incomplete-accounts?${params.toString()}`);
        if (res.ok) {
          const data = (await res.json()) as AdminIncompleteAccountsResponse;
          setIncompleteAccounts(data.items ?? []);
          setTotalIncomplete(data.total ?? 0);
        }
      } catch {
        // Network error handled silently
      } finally {
        setIncompleteLoading(false);
      }
    },
    [incompletePageSize]
  );

  // Fetch KPIs
  const fetchKpis = useCallback(async () => {
    setKpisLoading(true);
    try {
      const res = await fetch('/api/proxy/admin/payouts/kpis');
      if (res.ok) {
        const data = (await res.json()) as AdminPayoutKpis;
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
    if (initialPayouts === null || initialPayouts === undefined) {
      void fetchPayouts(payoutFilters, payoutsPage);
    }
  }, [fetchPayouts, initialPayouts, payoutFilters, payoutsPage]);

  useEffect(() => {
    if (initialIncompleteAccounts === null || initialIncompleteAccounts === undefined) {
      void fetchIncompleteAccounts(incompleteSearch, incompletePage);
    }
  }, [fetchIncompleteAccounts, initialIncompleteAccounts, incompleteSearch, incompletePage]);

  useEffect(() => {
    if (initialKpis === null || initialKpis === undefined) {
      void fetchKpis();
    }
  }, [fetchKpis, initialKpis]);

  // Tab 1 filter handlers
  const handleFilterChange = (nextFilters: PayoutFilterState) => {
    setPayoutFilters(nextFilters);
    setPayoutsPage(1);
    void fetchPayouts(nextFilters, 1);
  };

  const handleFilterReset = () => {
    setPayoutFilters(DEFAULT_FILTERS);
    setPayoutsPage(1);
    void fetchPayouts(DEFAULT_FILTERS, 1);
  };

  const handlePayoutPageChange = (newPage: number) => {
    setPayoutsPage(newPage);
    void fetchPayouts(payoutFilters, newPage);
  };

  // Tab 2 search and page handlers
  const handleIncompleteSearchSubmit = () => {
    setIncompletePage(1);
    void fetchIncompleteAccounts(incompleteSearch, 1);
  };

  const handleIncompleteReset = () => {
    setIncompleteSearch('');
    setIncompletePage(1);
    void fetchIncompleteAccounts('', 1);
  };

  const handleIncompletePageChange = (newPage: number) => {
    setIncompletePage(newPage);
    void fetchIncompleteAccounts(incompleteSearch, newPage);
  };

  // Modal / Drawer triggers
  const handleOpenInspect = (item: AdminPayoutListItem) => {
    setSelectedItem(item);
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setSelectedItem(null);
  };

  const handleOpenRetry = (item: AdminPayoutListItem) => {
    setRetryItem(item);
    setRetryModalOpen(true);
  };

  const handleCloseRetry = () => {
    setRetryModalOpen(false);
    setRetryItem(null);
  };

  const handleOpenRemind = (account: AdminIncompleteConnectAccount) => {
    setRemindAccount(account);
    setRemindModalOpen(true);
  };

  const handleCloseRemind = () => {
    setRemindModalOpen(false);
    setRemindAccount(null);
  };

  // Action: Retry Transfer
  const handleConfirmRetry = async () => {
    if (!retryItem) return;
    setRetrying(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/proxy/admin/payouts/${retryItem.id}/retry`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Échec lors du réessai du virement.');
      }

      setFeedback({
        type: 'success',
        message: `Virement réessayé avec succès pour la commande #${retryItem.orderNumber}.`,
      });

      setRetryModalOpen(false);
      setRetryItem(null);
      if (drawerOpen) {
        setDrawerOpen(false);
        setSelectedItem(null);
      }

      // Refresh list & KPIs
      void fetchPayouts(payoutFilters, payoutsPage);
      void fetchKpis();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Une erreur est survenue lors du virement.',
      });
    } finally {
      setRetrying(false);
    }
  };

  // Action: Send Connect Reminder
  const handleConfirmRemind = async () => {
    if (!remindAccount) return;
    setReminding(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/proxy/admin/payouts/accounts/${remindAccount.userId}/remind`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Échec lors de l'envoi de la relance.");
      }

      setFeedback({
        type: 'success',
        message: `Notification de relance envoyée avec succès à ${remindAccount.repairerName}.`,
      });

      setRemindModalOpen(false);
      setRemindAccount(null);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || "Une erreur est survenue lors de l'envoi de la relance.",
      });
    } finally {
      setReminding(false);
    }
  };

  // Action: Sync Connect Account
  const handleSyncAccount = async (account: AdminIncompleteConnectAccount) => {
    setSyncingId(account.id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/proxy/admin/payouts/accounts/${account.userId}/sync`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Échec lors de la synchronisation du compte Stripe.');
      }

      const updatedAccount = (await res.json()) as AdminIncompleteConnectAccount;

      // Update local list
      setIncompleteAccounts((prev) =>
        prev.map((acc) => (acc.id === updatedAccount.id ? updatedAccount : acc))
      );

      setFeedback({
        type: 'success',
        message: `Compte Stripe synchronisé pour ${account.repairerName}.`,
      });

      // Refetch KPIs to reflect any newly verified accounts
      void fetchKpis();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Une erreur est survenue lors de la synchronisation.',
      });
    } finally {
      setSyncingId(null);
    }
  };

  // Action: Export CSV
  const handleExport = () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (payoutFilters.q?.trim()) params.set('q', payoutFilters.q.trim());
      if (payoutFilters.status && payoutFilters.status !== 'ALL') {
        params.set('status', payoutFilters.status);
      }
      if (payoutFilters.period && payoutFilters.period !== 'all') {
        params.set('period', payoutFilters.period);
      }

      const qs = params.toString() ? `?${params.toString()}` : '';
      const exportUrl = `/api/proxy/admin/payouts/export${qs}`;

      if (typeof window !== 'undefined') {
        window.location.href = exportUrl;
      }
    } finally {
      setExporting(false);
    }
  };

  const totalPayoutPages = Math.max(1, Math.ceil(totalPayouts / payoutsPageSize));
  const totalIncompletePages = Math.max(1, Math.ceil(totalIncomplete / incompletePageSize));

  return (
    <div className="page page--detail">
      {/* Breadcrumb Navigation */}
      <Breadcrumbs
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Finance', href: '/paiements' },
          { label: 'Versements réparateurs' },
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
            Versements réparateurs
          </h1>
          <p style={{ margin: 0, color: 'var(--muted, #6b7280)', fontSize: '15px' }}>
            Suivez les versements Stripe Connect aux réparateurs, relancez les comptes incomplets et gérez les déblocages de fonds.
          </p>
        </div>
        {(!adminMe || hasPermission(adminMe, 'users.moderate')) && (
          <button
            type="button"
            onClick={handleTriggerFiscalReminders}
            disabled={fiscalReminding}
            style={{
              backgroundColor: 'var(--navy, #25324f)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--r-field, 6px)',
              padding: '9px 16px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: fiscalReminding ? 'not-allowed' : 'pointer',
              opacity: fiscalReminding ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {fiscalReminding ? 'Envoi des relances...' : 'Relances fiscales (DAC7)'}
          </button>
        )}
      </div>

      {/* Feedback Alert Banner */}
      {feedback && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--r-field, 6px)',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor:
              feedback.type === 'success' ? 'var(--badge-success-bg)' : 'var(--red-soft, #feedf0)',
            border: `1px solid ${feedback.type === 'success' ? 'var(--badge-success-border)' : 'var(--badge-danger-border)'}`,
            color:
              feedback.type === 'success' ? 'var(--badge-success-text)' : 'var(--red-text, #bd0e26)',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
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

      {/* Tab Switcher */}
      <div
        role="tablist"
        aria-label="Sections des versements"
        style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '24px',
          borderBottom: '1px solid var(--line, #dfe2e2)',
          paddingBottom: '12px',
        }}
      >
        <button
          type="button"
          role="tab"
          data-testid="tab-payouts"
          aria-selected={activeTab === 'payouts'}
          onClick={() => setActiveTab('payouts')}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: 600,
            borderRadius: 'var(--r-field, 4px)',
            border:
              activeTab === 'payouts'
                ? '1px solid var(--navy, #25324f)'
                : '1px solid var(--line, #dfe2e2)',
            backgroundColor:
              activeTab === 'payouts' ? 'var(--navy, #25324f)' : 'var(--paper, #ffffff)',
            color: activeTab === 'payouts' ? '#ffffff' : 'var(--ink, #141414)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'background-color 0.15s ease, color 0.15s ease',
          }}
        >
          <span>Journal des versements</span>
        </button>

        <button
          type="button"
          role="tab"
          data-testid="tab-incomplete-accounts"
          aria-selected={activeTab === 'incomplete-accounts'}
          onClick={() => setActiveTab('incomplete-accounts')}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: 600,
            borderRadius: 'var(--r-field, 4px)',
            border:
              activeTab === 'incomplete-accounts'
                ? '1px solid var(--navy, #25324f)'
                : '1px solid var(--line, #dfe2e2)',
            backgroundColor:
              activeTab === 'incomplete-accounts'
                ? 'var(--navy, #25324f)'
                : 'var(--paper, #ffffff)',
            color: activeTab === 'incomplete-accounts' ? '#ffffff' : 'var(--ink, #141414)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'background-color 0.15s ease, color 0.15s ease',
          }}
        >
          <span>Comptes Connect incomplets</span>
          {(kpis?.incompleteAccountsCount ?? 0) > 0 && (
            <span
              data-testid="incomplete-accounts-badge"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2px 8px',
                fontSize: '12px',
                fontWeight: 700,
                borderRadius: '999px',
                backgroundColor:
                  activeTab === 'incomplete-accounts' ? 'var(--paper)' : 'var(--badge-warning-bg)',
                color:
                  activeTab === 'incomplete-accounts'
                    ? 'var(--navy-text, #25324f)'
                    : 'var(--badge-warning-text)',
                lineHeight: 1,
              }}
            >
              {kpis?.incompleteAccountsCount}
            </span>
          )}
        </button>
      </div>

      {/* Main Responsive 2-column Detail Grid */}
      <div className="detail-grid">
        {/* Left Column (1.6fr): Payouts Table or Incomplete Accounts Table */}
        <div data-testid="detail-grid-left">
          {activeTab === 'payouts' ? (
            <>
              <PayoutsFilterToolbar
                filters={payoutFilters}
                onChange={handleFilterChange}
                onReset={handleFilterReset}
                loading={payoutsLoading}
              />

              <PayoutsTable
                items={payouts}
                total={totalPayouts}
                page={payoutsPage}
                pageSize={payoutsPageSize}
                totalPages={totalPayoutPages}
                onPageChange={handlePayoutPageChange}
                onInspect={handleOpenInspect}
                onRetry={handleOpenRetry}
                loading={payoutsLoading}
              />
            </>
          ) : (
            <>
              {/* Tab 2 Search Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '16px',
                  backgroundColor: 'var(--paper, #ffffff)',
                  border: '1px solid var(--line, #dfe2e2)',
                  borderRadius: 'var(--r-card, 8px)',
                  padding: '12px 16px',
                }}
              >
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type="text"
                    data-testid="incomplete-accounts-search-input"
                    value={incompleteSearch}
                    onChange={(e) => setIncompleteSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleIncompleteSearchSubmit();
                      }
                    }}
                    placeholder="Rechercher par réparateur, email ou compte Stripe..."
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '14px',
                      border: '1px solid var(--line, #dfe2e2)',
                      borderRadius: 'var(--r-field, 4px)',
                      outline: 'none',
                      backgroundColor: 'var(--paper, #ffffff)',
                      color: 'var(--ink, #141414)',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <button
                  type="button"
                  data-testid="incomplete-accounts-search-btn"
                  onClick={handleIncompleteSearchSubmit}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontWeight: 600,
                    borderRadius: 'var(--r-field, 4px)',
                    border: 'none',
                    backgroundColor: 'var(--navy, #25324f)',
                    color: '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  Rechercher
                </button>
                {incompleteSearch && (
                  <button
                    type="button"
                    data-testid="incomplete-accounts-reset-btn"
                    onClick={handleIncompleteReset}
                    style={{
                      padding: '8px 14px',
                      fontSize: '14px',
                      fontWeight: 500,
                      borderRadius: 'var(--r-field, 4px)',
                      border: '1px solid var(--line, #dfe2e2)',
                      backgroundColor: 'var(--paper, #ffffff)',
                      color: 'var(--ink, #141414)',
                      cursor: 'pointer',
                    }}
                  >
                    Réinitialiser
                  </button>
                )}
              </div>

              <IncompleteConnectAccountsTable
                items={incompleteAccounts}
                total={totalIncomplete}
                page={incompletePage}
                pageSize={incompletePageSize}
                totalPages={totalIncompletePages}
                onPageChange={handleIncompletePageChange}
                onSync={handleSyncAccount}
                onRemind={handleOpenRemind}
                syncingId={syncingId}
                loading={incompleteLoading}
              />
            </>
          )}
        </div>

        {/* Right Column (1.1fr): KPI Cards, Export Card & Escrow Info Card */}
        <div data-testid="detail-grid-right">
          <PayoutsKpiCards kpis={kpis} loading={kpisLoading} />

          <PayoutsExportCard
            filters={payoutFilters}
            totalCount={totalPayouts}
            onExport={handleExport}
            loading={exporting}
          />

          {/* Escrow rules info card */}
          <div
            data-testid="payouts-escrow-info-card"
            style={{
              backgroundColor: 'var(--paper, #ffffff)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-card, 8px)',
              padding: '20px',
              marginTop: '20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px',
              }}
            >
              <span style={{ fontSize: '18px' }} aria-hidden="true">
                <Icon as={ShieldCheck} />
              </span>
              <h3
                style={{
                  margin: 0,
                  fontSize: '15px',
                  fontWeight: 600,
                  color: 'var(--ink, #141414)',
                }}
              >
                Règles de versement Stripe Connect
              </h3>
            </div>
            <p
              style={{
                margin: '0 0 12px 0',
                fontSize: '13px',
                color: 'var(--muted, #6b7280)',
                lineHeight: 1.5,
              }}
            >
              Revime utilise Stripe Connect pour séquestrer les paiements clients et sécuriser les transactions de réparation.
            </p>
            <ul
              style={{
                margin: 0,
                paddingLeft: '18px',
                fontSize: '13px',
                color: 'var(--ink, #141414)',
                lineHeight: 1.6,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <li>
                <strong>Séquestre garanti :</strong> Les fonds de la commande restent protégés jusqu'à validation de la fin de réparation par le client ou résolution d'éventuels litiges.
              </li>
              <li>
                <strong>Virement automatisé :</strong> Dès déblocage, le virement Connect vers le compte bancaire du réparateur est exécuté automatiquement sous déduction de la commission Revime.
              </li>
              <li>
                <strong>Comptes restreints :</strong> En cas de documentation KYC incomplète sur Stripe Connect, les virements sont suspendus jusqu'à régularisation du compte.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Interactive Modals & Slide-over Drawer */}
      <PayoutRetryModal
        isOpen={retryModalOpen}
        item={retryItem}
        onClose={handleCloseRetry}
        onConfirm={handleConfirmRetry}
        loading={retrying}
      />

      <ConnectRemindModal
        isOpen={remindModalOpen}
        account={remindAccount}
        onClose={handleCloseRemind}
        onConfirm={handleConfirmRemind}
        loading={reminding}
      />

      <PayoutDetailDrawer
        isOpen={drawerOpen}
        item={selectedItem}
        onClose={handleCloseDrawer}
        onRetry={(item) => {
          handleCloseDrawer();
          handleOpenRetry(item);
        }}
      />
    </div>
  );
}
