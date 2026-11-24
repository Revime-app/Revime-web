'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdminPayoutListItem } from '@revime/shared';
import { formatEuros } from '../lib/money';
import { formatPayoutDate, getPayoutStatusBadge } from './PayoutsTable';
import { Clock, CreditCard, Package, TriangleAlert, User } from 'lucide-react';
import { Icon } from './Icon';

export interface PayoutDetailDrawerProps {
  isOpen: boolean;
  item: AdminPayoutListItem | null;
  onClose: () => void;
  onRetry?: (item: AdminPayoutListItem) => void;
}

export function PayoutDetailDrawer({
  isOpen,
  item,
  onClose,
  onRetry,
}: PayoutDetailDrawerProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  const statusBadge = getPayoutStatusBadge(item.status);
  const jsonString = JSON.stringify(item, null, 2);

  const handleCopyJson = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(jsonString).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div
        data-testid="payout-drawer-backdrop"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(2px)',
          zIndex: 1100,
          transition: 'opacity 0.2s ease',
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payout-detail-drawer-title"
        data-testid="payout-detail-drawer"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          maxWidth: '640px',
          height: '100%',
          backgroundColor: 'var(--paper, #ffffff)',
          zIndex: 1101,
          boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid var(--line, #dfe2e2)',
          overflowY: 'auto',
        }}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--line, #dfe2e2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--badge-neutral-bg)',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '20px' }} aria-hidden="true">
              <Icon as={CreditCard} />
            </span>
            <h3
              id="payout-detail-drawer-title"
              data-testid="payout-detail-drawer-title"
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--ink, #141414)',
                margin: 0,
              }}
            >
              Versement Commande {item.orderNumber}
            </h3>
            <span
              style={{
                display: 'inline-block',
                padding: '3px 10px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: statusBadge.bg,
                color: statusBadge.color,
                border: `1px solid ${statusBadge.border}`,
              }}
            >
              {statusBadge.label}
            </span>
          </div>

          <button
            type="button"
            data-testid="payout-detail-drawer-close-btn"
            onClick={onClose}
            aria-label="Fermer le panneau latéral"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '22px',
              color: 'var(--muted, #6b7280)',
              cursor: 'pointer',
              padding: '4px 8px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Drawer Content */}
        <div
          style={{
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            flex: 1,
          }}
        >
          {/* Quick links banner */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <Link
              href={`/commandes/${item.id}`}
              data-testid="payout-detail-order-link"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                fontSize: '12.5px',
                fontWeight: 600,
                color: 'var(--navy-text, #25324f)',
                backgroundColor: 'var(--navy-soft, #f0f1f5)',
                borderRadius: 'var(--r-field, 4px)',
                textDecoration: 'none',
              }}
            >
              <span aria-hidden="true"><Icon as={Package} /></span>
              <span>Voir la commande {item.orderNumber}</span>
            </Link>

            <Link
              href={`/utilisateurs/${item.repairerId}`}
              data-testid="payout-detail-repairer-link"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                fontSize: '12.5px',
                fontWeight: 600,
                color: 'var(--navy-text, #25324f)',
                backgroundColor: 'var(--navy-soft, #f0f1f5)',
                borderRadius: 'var(--r-field, 4px)',
                textDecoration: 'none',
              }}
            >
              <span aria-hidden="true"><Icon as={User} /></span>
              <span>Profil réparateur ({item.repairerName})</span>
            </Link>
          </div>

          {/* V8 ISS8-014: a HELD payout waits on the réparateur's setup and leaves by itself once it is
              done; it is not a transfer failure, so it gets an amber note, never the red failure box. */}
          {item.status === 'HELD' && item.failureReason && (
            <div
              data-testid="payout-held-banner"
              style={{
                padding: '14px 16px',
                backgroundColor: 'var(--badge-warning-bg)',
                border: '1px solid var(--badge-warning-border)',
                borderRadius: '6px',
                color: 'var(--badge-warning-text)',
                fontSize: '13px',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
              }}
            >
              <span style={{ fontSize: '18px', flexShrink: 0 }}><Icon as={Clock} /></span>
              <div>
                <div style={{ fontWeight: 700, marginBottom: '2px' }}>En attente du réparateur</div>
                <div style={{ lineHeight: 1.4 }}>{item.failureReason}</div>
                <div style={{ lineHeight: 1.4, marginTop: '2px' }}>
                  Le montant lui sera versé automatiquement dès que sa configuration est terminée.
                </div>
              </div>
            </div>
          )}

          {/* Failure Alert Banner (if failed) */}
          {item.status !== 'HELD' && item.failureReason && (
            <div
              style={{
                padding: '14px 16px',
                backgroundColor: 'var(--badge-danger-bg)',
                border: '1px solid var(--badge-danger-border)',
                borderRadius: '6px',
                color: 'var(--badge-danger-text)',
                fontSize: '13px',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
              }}
            >
              <span style={{ fontSize: '18px', flexShrink: 0 }}><Icon as={TriangleAlert} /></span>
              <div>
                <div style={{ fontWeight: 700, marginBottom: '2px' }}>Échec du transfert de fonds</div>
                <div style={{ lineHeight: 1.4 }}>{item.failureReason}</div>
              </div>
            </div>
          )}

          {/* Section 1: Financial breakdown */}
          <div
            style={{
              backgroundColor: 'var(--badge-neutral-bg)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: '6px',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <h4
              style={{
                margin: '0 0 4px 0',
                fontSize: '13px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--muted, #6b7280)',
                fontWeight: 700,
              }}
            >
              Décomposition Financière
            </h4>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>Montant net versé au réparateur :</span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--badge-success-text)' }}>
                {formatEuros(item.amountCents)}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>Total de la commande client :</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink, #141414)' }}>
                {formatEuros(item.totalOrderCents)}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>Commission plateforme Revime :</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--navy-text, #25324f)' }}>
                {formatEuros(item.commissionCents)}
              </span>
            </div>
          </div>

          {/* Section 2: Réparateur & Compte Stripe */}
          <div
            style={{
              backgroundColor: 'var(--badge-neutral-bg)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: '6px',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <h4
              style={{
                margin: '0 0 4px 0',
                fontSize: '13px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--muted, #6b7280)',
                fontWeight: 700,
              }}
            >
              Destinataire & Compte Stripe Connect
            </h4>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>Nom du réparateur :</span>
              <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink, #141414)' }}>
                {item.repairerName}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>Adresse e-mail :</span>
              <span style={{ fontSize: '13px', color: 'var(--ink, #141414)' }}>
                {item.repairerEmail}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>ID Compte Stripe (acct_...) :</span>
              <span
                style={{
                  fontFamily: 'monospace, monospace',
                  fontSize: '12.5px',
                  backgroundColor: 'var(--paper)',
                  border: '1px solid var(--line, #dfe2e2)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  color: 'var(--ink, #141414)',
                }}
              >
                {item.stripeAccountId || 'Non renseigné'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>Statut virements Stripe :</span>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  backgroundColor: item.transfersActive ? 'var(--badge-success-bg)' : 'var(--badge-danger-bg)',
                  color: item.transfersActive ? 'var(--badge-success-text)' : 'var(--badge-danger-text)',
                  border: item.transfersActive ? '1px solid var(--badge-success-border)' : '1px solid var(--badge-danger-border)',
                }}
              >
                {item.transfersActive ? 'Virements actifs' : 'Virements inactifs'}
              </span>
            </div>
          </div>

          {/* Section 3: Identifiants & Horodatages */}
          <div
            style={{
              backgroundColor: 'var(--badge-neutral-bg)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: '6px',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <h4
              style={{
                margin: '0 0 4px 0',
                fontSize: '13px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--muted, #6b7280)',
                fontWeight: 700,
              }}
            >
              Horodatages & Traçabilité Stripe
            </h4>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>Date de création commande :</span>
              <span style={{ fontSize: '13px', color: 'var(--ink, #141414)' }}>
                {formatPayoutDate(item.createdAt)}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>Date de paiement client :</span>
              <span style={{ fontSize: '13px', color: 'var(--ink, #141414)' }}>
                {formatPayoutDate(item.paidAt)}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>Date de libération / versement :</span>
              <span style={{ fontSize: '13px', color: 'var(--ink, #141414)' }}>
                {formatPayoutDate(item.releasedAt)}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>Stripe Charge ID (ch_...) :</span>
              <span
                style={{
                  fontFamily: 'monospace, monospace',
                  fontSize: '12px',
                  color: 'var(--ink, #141414)',
                }}
              >
                {item.stripeChargeId || '—'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>Stripe Transfer ID (tr_...) :</span>
              <span
                style={{
                  fontFamily: 'monospace, monospace',
                  fontSize: '12px',
                  color: 'var(--ink, #141414)',
                }}
              >
                {item.stripeTransferId || '—'}
              </span>
            </div>
          </div>

          {/* Section 4: JSON Payload Viewer */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--ink, #141414)',
                }}
              >
                Données brutes (JSON)
              </span>
              <button
                type="button"
                data-testid="payout-detail-copy-json-btn"
                onClick={handleCopyJson}
                style={{
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontWeight: 500,
                  borderRadius: 'var(--r-field, 4px)',
                  border: '1px solid var(--line, #dfe2e2)',
                  backgroundColor: 'var(--paper, #ffffff)',
                  color: 'var(--navy-text, #25324f)',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                }}
              >
                {copied ? '✓ Copié !' : 'Copier le JSON'}
              </button>
            </div>

            <pre
              style={{
                margin: 0,
                padding: '14px',
                backgroundColor: 'var(--badge-neutral-bg)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: '6px',
                fontSize: '12px',
                fontFamily: 'monospace, monospace',
                color: 'var(--ink, #141414)',
                overflowX: 'auto',
                maxHeight: '260px',
                lineHeight: 1.4,
              }}
            >
              {jsonString}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--line, #dfe2e2)',
            backgroundColor: 'var(--badge-neutral-bg)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            position: 'sticky',
            bottom: 0,
            zIndex: 10,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 500,
              borderRadius: 'var(--r-field, 4px)',
              border: '1px solid var(--line, #dfe2e2)',
              backgroundColor: 'var(--paper, #ffffff)',
              color: 'var(--ink, #141414)',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            Fermer
          </button>

          {item.canRetry && onRetry && (
            <button
              type="button"
              data-testid="payout-detail-retry-btn"
              onClick={() => onRetry(item)}
              style={{
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: 'var(--r-field, 4px)',
                border: '1px solid var(--navy, #25324f)',
                backgroundColor: 'var(--navy, #25324f)',
                color: '#ffffff',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
              }}
            >
              Réessayer le virement
            </button>
          )}
        </div>
      </div>
    </>
  );
}
