'use client';

import React from 'react';
import { particularQuotaStanding, type AdminParticularQuota } from '@revime/shared';
import { formatEuros } from '../lib/money';

export interface ParticularQuotaBlockProps {
  quota: AdminParticularQuota;
}

function formatEurosShort(cents: number): string {
  const eur = Math.round(cents / 100);
  return `${new Intl.NumberFormat('fr-FR').format(eur)} €`;
}

export function ParticularQuotaBlock({ quota }: ParticularQuotaBlockProps) {
  const missionsPercent =
    quota.missionsMax > 0
      ? Math.min(100, Math.max(0, Math.round((quota.missionsCount / quota.missionsMax) * 100)))
      : 0;
  const amountPercent =
    quota.amountMaxCents > 0
      ? Math.min(100, Math.max(0, Math.round((quota.amountCollectedCents / quota.amountMaxCents) * 100)))
      : 0;

  // V7 A10 (U7, `DEC7-22` Q11): the offer gate refuses a private individual at the cap since U7, so
  // the caption says so. It used to say the opposite, which was true until then (review ISS-061).
  const ceiling = `Plafond (CGU art. 53) : ${quota.missionsMax} missions ou ${formatEurosShort(quota.amountMaxCents)}. Au plafond, les offres sont bloquées jusqu'à la vérification de l'entreprise.`;
  const offersBlocked = particularQuotaStanding(quota) === 'REACHED';
  const releaseSubtext = quota.nextMissionReleaseAt
    ? `Prochaine mission libérée le ${new Date(quota.nextMissionReleaseAt).toLocaleDateString('fr-FR')}. ${ceiling}`
    : `Aucune mission sur les 12 derniers mois. ${ceiling}`;

  return (
    <div
      className="card"
      data-testid="particular-quota-block"
      style={{ marginBottom: '1.5rem' }}
    >
      {/* Title */}
      <h2
        style={{
          fontSize: '18px',
          margin: '0 0 1rem 0',
          color: 'var(--navy-text, #25324f)',
          fontWeight: 600,
        }}
      >
        Compteur particulier · 12 mois glissants
        {offersBlocked && (
          <span
            data-testid="quota-offers-blocked-badge"
            style={{
              marginLeft: '8px',
              fontSize: '11px',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '9999px',
              backgroundColor: 'var(--badge-danger-bg)',
              color: 'var(--badge-danger-text)',
              border: '1px solid var(--badge-danger-border)',
              verticalAlign: 'middle',
            }}
          >
            Offres bloquées
          </span>
        )}
      </h2>

      {/* Metric 1: Missions payées */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '14px', color: 'var(--ink2)' }}>
          Missions payées :{' '}
          <strong
            data-testid="quota-missions-value"
            style={{ color: 'var(--navy-text, #25324f)' }}
          >
            {`${quota.missionsCount} / ${quota.missionsMax}`}
          </strong>
        </div>
        <div
          data-testid="quota-missions-bar"
          role="progressbar"
          aria-valuenow={quota.missionsCount}
          aria-valuemin={0}
          aria-valuemax={quota.missionsMax}
          aria-label="Missions payées sur 12 mois glissants"
          style={{
            height: '8px',
            backgroundColor: 'var(--badge-neutral-bg)',
            borderRadius: '9999px',
            overflow: 'hidden',
            marginTop: '6px',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${missionsPercent}%`,
              backgroundColor: 'var(--badge-warning-text)',
              borderRadius: '9999px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Metric 2: Montant encaissé */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '14px', color: 'var(--ink2)' }}>
          Montant encaissé :{' '}
          <strong
            data-testid="quota-amount-value"
            style={{ color: 'var(--navy-text, #25324f)' }}
          >
            {`${formatEurosShort(quota.amountCollectedCents)} / ${formatEurosShort(quota.amountMaxCents)}`}
          </strong>
        </div>
        <div
          data-testid="quota-amount-bar"
          role="progressbar"
          aria-valuenow={Math.round(quota.amountCollectedCents / 100)}
          aria-valuemin={0}
          aria-valuemax={Math.round(quota.amountMaxCents / 100)}
          aria-label="Montant encaissé sur 12 mois glissants"
          style={{
            height: '8px',
            backgroundColor: 'var(--badge-neutral-bg)',
            borderRadius: '9999px',
            overflow: 'hidden',
            marginTop: '6px',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${amountPercent}%`,
              backgroundColor: 'var(--badge-warning-text)',
              borderRadius: '9999px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Release subtext */}
      <p
        data-testid="quota-release-subtext"
        style={{
          fontSize: '13px',
          color: 'var(--muted, #64748b)',
          margin: '0 0 1.25rem 0',
          lineHeight: 1.45,
        }}
      >
        {releaseSubtext}
      </p>

      {/* Section Versements */}
      <div
        style={{
          paddingTop: '1rem',
          borderTop: '1px solid var(--line, #dfe2e2)',
        }}
      >
        <h3
          style={{
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--navy-text, #25324f)',
            margin: '0 0 8px 0',
          }}
        >
          Versements
        </h3>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '14px',
          }}
        >
          <span style={{ color: 'var(--muted, #64748b)' }}>En attente</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              data-testid="quota-pending-payout"
              style={{ fontWeight: 600, color: 'var(--navy-text, #25324f)' }}
            >
              {formatEuros(quota.pendingPayoutCents)}
            </span>
            {quota.isBlockedFiscal && (
              <span
                data-testid="quota-blocked-fiscal-badge"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  backgroundColor: 'var(--badge-danger-bg)',
                  color: 'var(--badge-danger-text)',
                  border: '1px solid var(--badge-danger-border)',
                }}
              >
                Bloqué : infos fiscales
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
