'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type {
  AdminPromoKpis,
  AdminPromoListItem,
  AdminPromoListResponse,
  PromoCodeCreateInput,
} from '@revime/shared';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { PromoKpiCards } from '../../components/PromoKpiCards';
import { PromoCodesTable } from '../../components/PromoCodesTable';
import { PromoCreateModal } from '../../components/PromoCreateModal';
import {
  ReferralLeaderboardCard,
  type ReferralLeaderboardItem,
} from '../../components/ReferralLeaderboardCard';
import {
  PromoUsagesTable,
  type PromoUsageItem,
} from '../../components/PromoUsagesTable';

/**
 * RU-24. Creating a code works, but the app has no field to enter one and checkout never applies a
 * discount, so no code can be redeemed and the counters below cannot move. Remove this notice
 * when the checkout and the app are wired (ISS-107).
 */
export const PROMO_NOT_REDEEMABLE_NOTICE =
  "Les codes ne sont pas encore utilisables dans l'application : le client ne peut pas en saisir un et le paiement n'applique aucune réduction. " +
  "Vous pouvez les préparer ici ; les utilisations et le parrainage restent à zéro tant que ce n'est pas branché.";

export interface CodesPromoPageProps {
  initialPromos?: AdminPromoListItem[] | null;
  initialKpis?: AdminPromoKpis | null;
  initialUsages?: PromoUsageItem[] | null;
  initialLeaderboard?: ReferralLeaderboardItem[] | null;
  initialCreateModalOpen?: boolean;
}

export default function CodesPromoPage({
  initialPromos = null,
  initialKpis = null,
  initialUsages = null,
  initialLeaderboard = null,
  initialCreateModalOpen = false,
}: CodesPromoPageProps) {
  // Data State
  const [promos, setPromos] = useState<AdminPromoListItem[]>(initialPromos ?? []);
  const [promosLoading, setPromosLoading] = useState(false);
  const [kpis, setKpis] = useState<AdminPromoKpis | null>(initialKpis);
  const [kpisLoading, setKpisLoading] = useState(false);
  const [usages, setUsages] = useState<PromoUsageItem[]>(initialUsages ?? []);
  const [leaderboard, setLeaderboard] = useState<ReferralLeaderboardItem[]>(
    initialLeaderboard ?? []
  );

  // Modal & Actions State
  const [createModalOpen, setCreateModalOpen] = useState(initialCreateModalOpen);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Sync initial props if updated dynamically
  useEffect(() => {
    if (initialPromos !== null && initialPromos !== undefined) {
      setPromos(initialPromos);
    }
  }, [initialPromos]);

  useEffect(() => {
    if (initialKpis !== null && initialKpis !== undefined) {
      setKpis(initialKpis);
    }
  }, [initialKpis]);

  useEffect(() => {
    if (initialUsages !== null && initialUsages !== undefined) {
      setUsages(initialUsages);
    }
  }, [initialUsages]);

  useEffect(() => {
    if (initialLeaderboard !== null && initialLeaderboard !== undefined) {
      setLeaderboard(initialLeaderboard);
    }
  }, [initialLeaderboard]);

  useEffect(() => {
    if (initialCreateModalOpen !== undefined) {
      setCreateModalOpen(initialCreateModalOpen);
    }
  }, [initialCreateModalOpen]);

  // Fetch Promo codes list
  const fetchPromos = useCallback(async () => {
    setPromosLoading(true);
    try {
      const res = await fetch('/api/proxy/admin/promos');
      if (res.ok) {
        const data = (await res.json()) as AdminPromoListResponse;
        setPromos(data.items ?? []);
      }
    } catch {
      // Network error handled silently
    } finally {
      setPromosLoading(false);
    }
  }, []);

  // Fetch KPIs
  const fetchKpis = useCallback(async () => {
    setKpisLoading(true);
    try {
      const res = await fetch('/api/proxy/admin/promos/kpis');
      if (res.ok) {
        const data = (await res.json()) as AdminPromoKpis;
        setKpis(data);
      }
    } catch {
      // Network error handled silently
    } finally {
      setKpisLoading(false);
    }
  }, []);

  // Initial load if not provided via props
  useEffect(() => {
    if (!initialPromos) {
      void fetchPromos();
    }
    if (!initialKpis) {
      void fetchKpis();
    }
  }, [fetchPromos, fetchKpis, initialPromos, initialKpis]);

  // Handle status toggle (Pause / Activer)
  const handleToggleStatus = async (promo: AdminPromoListItem) => {
    const nextStatus = promo.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      const res = await fetch(`/api/proxy/admin/promos/${promo.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Échec lors de la mise à jour du statut.');
      }

      setFeedback({
        type: 'success',
        message: `Le code promo "${promo.code}" est désormais ${
          nextStatus === 'ACTIVE' ? 'actif' : 'en pause'
        }.`,
      });

      // Refetch data
      void fetchPromos();
      void fetchKpis();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Une erreur est survenue.',
      });
    }
  };

  // Handle create promo submission
  const handleCreatePromo = async (payload: PromoCodeCreateInput) => {
    setSubmittingCreate(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/proxy/admin/promos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Échec lors de la création du code promotionnel.');
      }

      setCreateModalOpen(false);
      setFeedback({
        type: 'success',
        message: `Code promo "${payload.code}" créé avec succès !`,
      });

      void fetchPromos();
      void fetchKpis();
    } finally {
      setSubmittingCreate(false);
    }
  };

  return (
    <div className="page page--detail">
      {/* Breadcrumb Navigation */}
      <Breadcrumbs
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Finance', href: '/paiements' },
          { label: 'Codes promo & parrainage' },
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
          marginBottom: '24px',
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
            Codes promo & parrainage
          </h1>
          <p style={{ margin: 0, color: 'var(--muted, #6b7280)', fontSize: '15px' }}>
            Pilotez les réductions subventionnées par la plateforme, les campagnes marketing et le programme de parrainage client.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreateModalOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: 600,
            backgroundColor: 'var(--navy, #25324f)',
            color: '#ffffff',
            border: 'none',
            borderRadius: 'var(--r-field, 4px)',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(37, 50, 79, 0.2)',
          }}
        >
          <span>+ Créer un code</span>
        </button>
      </div>

      {/* The codes cannot be redeemed yet: say so rather than show counters that can only read zero. */}
      <div
        data-testid="promo-not-redeemable-notice"
        role="note"
        style={{
          padding: '12px 16px',
          borderRadius: 'var(--r-field, 6px)',
          marginBottom: '20px',
          fontSize: '14px',
          backgroundColor: 'var(--badge-warning-bg)',
          color: 'var(--badge-warning-text)',
          border: '1px solid var(--line, #dfe2e2)',
        }}
      >
        {PROMO_NOT_REDEEMABLE_NOTICE}
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

      {/* Main 2-column Detail Grid */}
      <div className="detail-grid">
        {/* Left Column (1.6fr): Codes Table & Usages Table */}
        <div data-testid="detail-grid-left">
          <PromoCodesTable
            items={promos}
            loading={promosLoading}
            onToggleStatus={handleToggleStatus}
            onRefresh={fetchPromos}
          />

          <PromoUsagesTable items={usages} />
        </div>

        {/* Right Column (1.1fr): KPI Cards & Referral Leaderboard */}
        <div data-testid="detail-grid-right">
          <PromoKpiCards kpis={kpis} loading={kpisLoading} />

          <ReferralLeaderboardCard items={leaderboard} />
        </div>
      </div>

      {/* Create Promo Modal */}
      <PromoCreateModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreate={handleCreatePromo}
        submitting={submittingCreate}
      />
    </div>
  );
}
