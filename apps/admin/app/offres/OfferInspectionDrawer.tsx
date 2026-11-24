'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { AdminOfferContextDto } from '@revime/shared';
import { OFFER_STATUS_LABEL } from '@revime/shared';
import { OfferComparisonTable } from './OfferComparisonTable';
import { ModerateOfferModal } from './ModerateOfferModal';
import { useAdminMe } from '../../components/AdminGate';
import { hasPermission } from '../../lib/permissions';
import { formatEuros } from '../../lib/money';
import { Package, TriangleAlert } from 'lucide-react';
import { Icon } from '../../components/Icon';

export interface OfferInspectionDrawerProps {
  offerId: string | null;
  onClose: () => void;
  onOfferModerated?: () => void;
}

export function OfferInspectionDrawer({
  offerId,
  onClose,
  onOfferModerated,
}: OfferInspectionDrawerProps) {
  const [data, setData] = useState<AdminOfferContextDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModerateModalOpen, setIsModerateModalOpen] = useState(false);
  // CF4-40: display only - the API answers 403 to a role without the permission.
  const adminMe = useAdminMe();
  const canModerate = hasPermission(adminMe, 'content.moderate');

  const fetchContext = useCallback(async () => {
    if (!offerId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/proxy/admin/offres/${offerId}/context`);
      if (!res.ok) {
        const errJson = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(errJson?.message || 'Impossible de charger les détails de l\'offre.');
        setLoading(false);
        return;
      }
      const json = (await res.json()) as AdminOfferContextDto;
      setData(json);
    } catch {
      setError('Erreur réseau lors du chargement des détails de l\'offre.');
    } finally {
      setLoading(false);
    }
  }, [offerId]);

  useEffect(() => {
    if (offerId) {
      void fetchContext();
    } else {
      setData(null);
      setError(null);
      setLoading(false);
      setIsModerateModalOpen(false);
    }
  }, [offerId, fetchContext]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isModerateModalOpen && offerId) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModerateModalOpen, offerId, onClose]);

  if (!offerId) return null;

  const isWithdrawn = data?.offer.withdrawn || data?.offer.status === 'WITHDRAWN';

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(2px)',
          zIndex: 900,
          transition: 'opacity 0.2s ease',
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer Container */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-offer-title"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          maxWidth: '720px',
          height: '100%',
          backgroundColor: 'var(--paper, #ffffff)',
          zIndex: 901,
          boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
      >
        {/* Drawer Fixed Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--line, #dfe2e2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--paper)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2
              id="drawer-offer-title"
              style={{
                fontSize: '18px',
                fontWeight: 700,
                margin: 0,
                color: 'var(--ink, #141414)',
              }}
            >
              Inspection de l'offre
            </h2>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                color: 'var(--muted, #6b7280)',
                backgroundColor: 'var(--badge-neutral-bg)',
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid var(--line)',
              }}
            >
              #{offerId.slice(0, 8)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le panneau d'inspection"
            style={{
              padding: '6px 12px',
              fontSize: '16px',
              fontWeight: 700,
              backgroundColor: 'transparent',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
              cursor: 'pointer',
              color: 'var(--muted, #6b7280)',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Drawer Scrollable Content */}
        <div
          style={{
            flex: '1 1 auto',
            overflowY: 'auto',
            padding: '20px 24px',
          }}
        >
          {loading && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted, #6b7280)' }}>
              Chargement des détails de l'offre…
            </div>
          )}

          {error && (
            <div
              role="alert"
              style={{
                padding: '16px',
                backgroundColor: 'var(--red-soft, #feedf0)',
                border: '1px solid var(--badge-danger-border)',
                borderRadius: 'var(--r-card, 6px)',
                color: 'var(--red-text, #bd0e26)',
                fontSize: '14px',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '8px' }}>Erreur</div>
              <div>{error}</div>
              <button
                type="button"
                onClick={() => void fetchContext()}
                style={{
                  marginTop: '12px',
                  padding: '6px 14px',
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: 'var(--red-deep, #bd0e26)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Réessayer
              </button>
            </div>
          )}

          {!loading && !error && data && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Demande Summary Card */}
              <div
                style={{
                  padding: '16px',
                  backgroundColor: 'var(--badge-neutral-bg)',
                  borderRadius: 'var(--r-card, 8px)',
                  border: '1px solid var(--line, #dfe2e2)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted, #6b7280)', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Demande associée
                    </div>
                    <Link
                      href={`/demandes/${data.demande.id}`}
                      style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        color: 'var(--navy-text, #25324f)',
                        textDecoration: 'none',
                      }}
                    >
                      {data.demande.title}
                    </Link>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: 'var(--badge-info-bg)',
                        color: 'var(--badge-info-text)',
                        border: '1px solid var(--badge-info-border)',
                      }}
                    >
                      {data.demande.mode === 'OFFERS' ? 'Devis libres' : 'Budget fixé'}
                    </span>
                    {data.demande.budgetCents != null && (
                      <span
                        style={{
                          display: 'inline-flex',
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: 'var(--badge-warning-bg)',
                          color: 'var(--badge-warning-text)',
                          border: '1px solid var(--badge-warning-border)',
                        }}
                      >
                        Budget : {formatEuros(data.demande.budgetCents)}
                      </span>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '12px 20px',
                    marginTop: '12px',
                    fontSize: '13px',
                    color: 'var(--muted, #6b7280)',
                  }}
                >
                  <div>
                    <strong style={{ color: 'var(--ink, #141414)' }}>Auteur :</strong>{' '}
                    <Link
                      href={`/utilisateurs/${data.demande.authorUserId}`}
                      style={{ color: 'var(--navy-text, #25324f)', textDecoration: 'none', fontWeight: 500 }}
                    >
                      {data.demande.authorName}
                    </Link>
                  </div>
                  <div>
                    <strong style={{ color: 'var(--ink, #141414)' }}>Lieu :</strong> {data.demande.locationLabel}
                  </div>
                  <div>
                    <strong style={{ color: 'var(--ink, #141414)' }}>Catégorie :</strong> {data.demande.categoryName}
                  </div>
                  <div>
                    <strong style={{ color: 'var(--ink, #141414)' }}>Créée le :</strong>{' '}
                    {new Date(data.demande.createdAt).toLocaleDateString('fr-FR')}
                  </div>
                </div>
              </div>

              {/* Status Header Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  backgroundColor: 'var(--paper)',
                  borderRadius: 'var(--r-card, 6px)',
                  border: '1px solid var(--line, #dfe2e2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink, #141414)' }}>
                    Statut de l'offre :
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '3px 10px',
                      borderRadius: '9999px',
                      fontSize: '12px',
                      fontWeight: 700,
                      backgroundColor:
                        data.offer.status === 'ACCEPTED'
                          ? 'var(--green-soft, #e7f8f0)'
                          : data.offer.status === 'SENT'
                          ? 'var(--badge-info-bg)'
                          : data.offer.status === 'WITHDRAWN'
                          ? 'var(--red-soft, #feedf0)'
                          : 'var(--badge-neutral-bg)',
                      color:
                        data.offer.status === 'ACCEPTED'
                          ? 'var(--green-deep, #0a8a50)'
                          : data.offer.status === 'SENT'
                          ? 'var(--badge-info-text)'
                          : data.offer.status === 'WITHDRAWN'
                          ? 'var(--red-text, #bd0e26)'
                          : 'var(--ink2)',
                      border: `1px solid ${
                        data.offer.status === 'ACCEPTED'
                          ? 'var(--badge-success-border)'
                          : data.offer.status === 'SENT'
                          ? 'var(--badge-info-border)'
                          : data.offer.status === 'WITHDRAWN'
                          ? 'var(--badge-danger-border)'
                          : 'var(--line)'
                      }`,
                    }}
                  >
                    {OFFER_STATUS_LABEL[data.offer.status] ?? data.offer.status}
                  </span>
                  {data.offer.withdrawn && data.offer.deletedReason && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '3px 8px',
                        borderRadius: '9999px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: 'var(--red-soft, #feedf0)',
                        color: 'var(--red-text, #bd0e26)',
                        border: '1px solid var(--badge-danger-border)',
                      }}
                    >
                      Retirée (Modérée)
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}>
                  Émise le {new Date(data.offer.createdAt).toLocaleDateString('fr-FR')}
                </div>
              </div>

              {/* Section 1: Réparateur */}
              <div
                style={{
                  padding: '16px',
                  backgroundColor: 'var(--paper)',
                  borderRadius: 'var(--r-card, 6px)',
                  border: '1px solid var(--line, #dfe2e2)',
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--muted, #6b7280)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: '10px',
                  }}
                >
                  Réparateur émetteur
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Link
                      href={`/utilisateurs/${data.offer.repairerUserId}`}
                      style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        color: 'var(--ink, #141414)',
                        textDecoration: 'none',
                      }}
                    >
                      {data.offer.repairerName}
                    </Link>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 7px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: data.offer.repairerKind === 'PROFESSIONNEL' ? 'var(--badge-info-bg)' : 'var(--badge-neutral-bg)',
                        color: data.offer.repairerKind === 'PROFESSIONNEL' ? 'var(--badge-info-text)' : 'var(--ink2)',
                        border: `1px solid ${
                          data.offer.repairerKind === 'PROFESSIONNEL' ? 'var(--badge-info-border)' : 'var(--line)'
                        }`,
                      }}
                    >
                      {data.offer.repairerKind === 'PROFESSIONNEL' ? 'PRO' : 'PARTICULIER'}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      color: data.offer.repairerRating != null ? 'var(--badge-warning-text)' : 'var(--muted, #6b7280)',
                      fontWeight: 600,
                    }}
                  >
                    {data.offer.repairerRating != null
                      ? `★ ${data.offer.repairerRating.toFixed(1)} (${data.offer.repairerReviewCount} avis)`
                      : '★ Nouveau'}
                  </div>
                </div>
              </div>

              {/* Section 2: Détails complets du devis */}
              <div
                style={{
                  padding: '16px',
                  backgroundColor: 'var(--paper)',
                  borderRadius: 'var(--r-card, 6px)',
                  border: '1px solid var(--line, #dfe2e2)',
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--muted, #6b7280)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: '12px',
                  }}
                >
                  Détails complets du devis
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '14px',
                    fontSize: '13px',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--muted, #6b7280)', display: 'block', marginBottom: '2px' }}>
                      Prix proposé
                    </span>
                    <strong style={{ fontSize: '18px', color: 'var(--ink, #141414)' }}>
                      {formatEuros(data.offer.priceCents)}
                    </strong>
                  </div>

                  <div>
                    <span style={{ color: 'var(--muted, #6b7280)', display: 'block', marginBottom: '2px' }}>
                      Délai d'intervention
                    </span>
                    <strong style={{ fontSize: '15px', color: 'var(--ink, #141414)' }}>
                      {data.offer.delayHours} heures
                    </strong>
                  </div>

                  <div>
                    <span style={{ color: 'var(--muted, #6b7280)', display: 'block', marginBottom: '2px' }}>
                      Garantie offerte
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>
                      {data.offer.warrantyLabel}
                    </span>
                  </div>

                  <div>
                    <span style={{ color: 'var(--muted, #6b7280)', display: 'block', marginBottom: '2px' }}>
                      Pièces de rechange
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>
                      {data.offer.partsLabel}
                    </span>
                  </div>

                  <div>
                    <span style={{ color: 'var(--muted, #6b7280)', display: 'block', marginBottom: '2px' }}>
                      Mode d'intervention
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>
                      {data.offer.travel === 'WORKSHOP' ? 'En atelier' : 'À domicile'}
                    </span>
                  </div>

                  <div>
                    <span style={{ color: 'var(--muted, #6b7280)', display: 'block', marginBottom: '2px' }}>
                      Expédition par colis
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>
                      {data.offer.acceptsParcel ? (
                        <>
                          <Icon as={Package} /> Colis accepté
                        </>
                      ) : (
                        'Pas de colis'
                      )}
                    </span>
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ color: 'var(--muted, #6b7280)', display: 'block', marginBottom: '2px' }}>
                      Chaîne de révision
                    </span>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        backgroundColor: 'var(--badge-neutral-bg)',
                        borderRadius: '4px',
                        border: '1px solid var(--line)',
                        fontWeight: 600,
                        fontSize: '12px',
                        color: 'var(--ink2)',
                      }}
                    >
                      Révision {data.offer.revision.position} sur {data.offer.revision.total} pour cette demande
                    </span>
                  </div>
                </div>

                {data.offer.comment && (
                  <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--badge-neutral-bg)' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted, #6b7280)', display: 'block', marginBottom: '4px' }}>
                      Commentaire du réparateur :
                    </span>
                    <div
                      style={{
                        padding: '10px 14px',
                        backgroundColor: 'var(--badge-neutral-bg)',
                        borderRadius: '4px',
                        border: '1px solid var(--line)',
                        fontStyle: 'italic',
                        color: 'var(--ink2)',
                        fontSize: '13px',
                        lineHeight: 1.5,
                      }}
                    >
                      « {data.offer.comment} »
                    </div>
                  </div>
                )}

                {data.offer.deletedReason && (
                  <div
                    style={{
                      marginTop: '14px',
                      padding: '12px 14px',
                      backgroundColor: 'var(--red-soft, #feedf0)',
                      border: '1px solid var(--badge-danger-border)',
                      borderRadius: '4px',
                      color: 'var(--red-text, #bd0e26)',
                      fontSize: '13px',
                    }}
                  >
                    <strong>Motif de modération / retrait :</strong> {data.offer.deletedReason}
                    {data.offer.deletedByUserId && (
                      <div style={{ marginTop: '4px', fontSize: '12px' }}>
                        Retirée par administrateur : {data.offer.deletedByUserId}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Section 3: Signalements */}
              {data.offer.conversationReportCount > 0 && (
                <div
                  style={{
                    padding: '14px 16px',
                    backgroundColor: 'var(--badge-danger-bg)',
                    border: '1px solid var(--badge-danger-border)',
                    borderRadius: 'var(--r-card, 6px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div style={{ color: 'var(--badge-danger-text)', fontSize: '13px', fontWeight: 600 }}>
                    <Icon as={TriangleAlert} /> {data.offer.conversationReportCount} signalement(s) sur la conversation liée
                  </div>
                  <Link
                    href="/signalements"
                    style={{
                      padding: '4px 10px',
                      backgroundColor: 'var(--red)',
                      color: '#ffffff',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    Voir les signalements
                  </Link>
                </div>
              )}

              {/* Section 4: Concurrence & Comparatif du marché */}
              <div
                style={{
                  padding: '16px',
                  backgroundColor: 'var(--paper)',
                  borderRadius: 'var(--r-card, 6px)',
                  border: '1px solid var(--line, #dfe2e2)',
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--muted, #6b7280)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Concurrence & Comparatif du marché
                </div>
                <OfferComparisonTable
                  competingOffers={data.competingOffers}
                  currentOfferId={data.offer.offerId}
                  stats={data.stats}
                />
              </div>
            </div>
          )}
        </div>

        {/* Drawer Fixed Footer Actions */}
        {!loading && !error && data && (
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--line, #dfe2e2)',
              backgroundColor: 'var(--paper)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div>
              {isWithdrawn ? (
                <div style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', fontStyle: 'italic' }}>
                  Cette offre est actuellement retirée
                  {data.offer.deletedReason ? ` : ${data.offer.deletedReason}` : ''}.
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}>
                  Offre active · Action de modération soumise à traçabilité
                </div>
              )}
            </div>

            <div>
              {!isWithdrawn && (
                <button hidden={!canModerate}
                  type="button"
                  onClick={() => setIsModerateModalOpen(true)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'var(--red)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--r-field, 4px)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  Retirer cette offre (modération)
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Moderation Modal */}
      {data && (
        <ModerateOfferModal
          isOpen={isModerateModalOpen}
          offerId={data.offer.offerId}
          repairerName={data.offer.repairerName}
          demandeTitle={data.demande.title}
          onClose={() => setIsModerateModalOpen(false)}
          onSuccess={() => {
            setIsModerateModalOpen(false);
            void fetchContext();
            onOfferModerated?.();
          }}
        />
      )}
    </>
  );
}
