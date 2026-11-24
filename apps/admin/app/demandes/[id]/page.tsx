'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ADMIN_AUDIT_ACTION_LABEL,
  DEMANDE_STATUS_LABEL,
  OFFER_STATUS_LABEL,
  COMMANDE_STATUS_LABEL,
  type AdminDemandeDetail,
  type AdminDemandeActivityEntry,
} from '@revime/shared';
import { DemandeActionForms } from '../../../components/DemandeActionForms';
import { DemandeConversations } from '../../../components/DemandeConversations';
import { Can } from '../../../components/Can';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { CopyableReference } from '../../../components/CopyableReference';
import { formatEuros } from '../../../lib/money';
import { quoteClosedReasonLabel } from '../../../lib/quote-admin';
import { isDeletedUser, safeUserEmail, DELETED_USER_NAME } from '../../../lib/user-display';
import { DemandeDetailView } from './DemandeDetailView';
import { TriangleAlert } from 'lucide-react';
import { Icon } from '../../../components/Icon';

type View =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'loaded'; data: AdminDemandeDetail };

/**
 * 🛑 The state column is not decoration. A demande removed by its own author (CF-16) and one
 * removed by an operator both carry `deletedAt`, so the row renders `state` AND
 * `removedByAdmin` - « supprimée par le client » against « supprimée par l'équipe ». Reading
 * only `state` would attribute a client's own decision to us.
 */
const STATE_LABEL: Record<AdminDemandeDetail['state'], string> = {
  visible: 'Visible',
  masquee: 'Masquée',
  supprimee: 'Supprimée',
};

const PARTS_LABEL: Record<AdminDemandeDetail['parts'], string> = {
  UNKNOWN: 'Non spécifié',
  ORIGINAL: 'Pièces d\'origine',
  COMPATIBLE: 'Pièces compatibles',
  CLIENT_SUPPLIED: 'Pièces fournies par le client',
};

export default function DemandeFichePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [view, setView] = useState<View>({ state: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && lightboxPhoto) {
        setLightboxPhoto(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxPhoto]);

  const load = useCallback(async () => {
    setView({ state: 'loading' });
    try {
      const r = await fetch(`/api/proxy/admin/demandes/${id}`);
      if (!r.ok) {
        setView({ state: 'error' });
        return;
      }
      setView({ state: 'loaded', data: (await r.json()) as AdminDemandeDetail });
    } catch {
      setView({ state: 'error' });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * One handler for every write, because they differ only in path, method, body and
   * confirmation. `confirmText` is null for the reversible ones.
   *
   * 🛑 The success message is set AFTER the reload and rendered outside the detail
   * block. P5's review found both operator pages discarding their own success message,
   * so an irreversible action confirmed nothing and invited the retry.
   */
  async function act(
    path: string,
    method: 'PATCH' | 'DELETE',
    body: unknown,
    successMessage: string,
    confirmText: string | null,
  ) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await fetch(`/api/proxy/${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error?.message || 'Une erreur est survenue.');
        setBusy(false);
        return;
      }
      await load();
      setSuccess(successMessage);
    } catch {
      setError('Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page page--detail">
      <Breadcrumbs
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Demandes', href: '/demandes' },
          {
            label:
              view.state === 'loaded'
                ? view.data.title || `Demande #${view.data.demandeId ? view.data.demandeId.slice(0, 8) : ''}`
                : 'Fiche demande',
          },
        ]}
      />

      <div style={{ marginBottom: '16px' }}>
        <Link
          href="/demandes"
          style={{
            color: 'var(--muted)',
            textDecoration: 'none',
            fontSize: '14px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 500,
          }}
        >
          ← Retour aux demandes
        </Link>
      </div>

      <h1>Fiche demande</h1>

      {view.state === 'loading' && <p>Chargement...</p>}

      {view.state === 'error' && (
        <p role="alert" style={{ color: 'red' }}>
          Impossible de charger cette fiche demande.
        </p>
      )}

      {/* Success and error messages rendered OUTSIDE the view.state === 'loaded' block
          so they survive the reload after an action. */}
      {error && (
        <p role="alert" style={{ color: 'red' }}>
          {error}
        </p>
      )}
      {success && (
        <p role="status" style={{ color: 'green' }}>
          {success}
        </p>
      )}

      {view.state === 'loaded' && (() => {
        const d = view.data;
        return (
          <>
            {/* Warning when payment is in flight */}
            {d.paymentInFlight && (
              <div role="alert" className="banner" style={{ marginBottom: '20px' }}>
                <strong><Icon as={TriangleAlert} /> Paiement en cours</strong>
                <p style={{ marginTop: '0.25rem', marginBottom: 0 }}>
                  Un paiement est en cours sur cette demande. Le masquage et la suppression sont
                  refusés tant qu&apos;il n&apos;est pas terminé ou abandonné.
                </p>
              </div>
            )}

            <div className="detail-grid">
              {/* Left Column: Demande Content, Offers, Orders & Activity */}
              <div data-testid="detail-grid-left">
                {/* Content, fault type badge and photos */}
                <DemandeDetailView demande={d} onLightboxPhoto={setLightboxPhoto} />

                {/* Embedded Conversations Viewer */}
                <DemandeConversations conversations={d.conversations} />

                {/* Offers */}
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                  <h2 style={{ fontSize: '18px', marginBottom: '1rem' }}>Offres</h2>
                  {d.offers.length === 0 && <p>Aucune offre.</p>}
                  {d.offers.length > 0 && (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Réparateur</th>
                          <th>Prix</th>
                          <th>Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.offers.map((offer) => (
                          <tr key={offer.offerId}>
                            <td>
                              {offer.repairerId ? (
                                <Link
                                  href={`/utilisateurs/${encodeURIComponent(offer.repairerId)}`}
                                  style={{
                                    color: 'var(--navy-text, #25324f)',
                                    fontWeight: 600,
                                    textDecoration: 'underline',
                                  }}
                                >
                                  {offer.repairerName}
                                </Link>
                              ) : (
                                offer.repairerName
                              )}
                            </td>
                            <td>{formatEuros(offer.priceCents)}</td>
                            <td>{OFFER_STATUS_LABEL[offer.status]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Commandes */}
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                  <h2 style={{ fontSize: '18px', marginBottom: '1rem' }}>Commandes</h2>
                  {d.commandes.length === 0 && <p>Aucune commande.</p>}
                  {d.commandes.length > 0 && (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Référence</th>
                          <th>Statut</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.commandes.map((commande) => (
                          <tr key={commande.commandeId}>
                            <td>
                              <CopyableReference
                                value={commande.commandeId}
                                prefix="CMD"
                                href={`/commandes/${encodeURIComponent(commande.commandeId)}`}
                              />
                            </td>
                            <td>{COMMANDE_STATUS_LABEL[commande.status]}</td>
                            <td>{formatEuros(commande.totalCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Activity timeline */}
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                  <h2 style={{ fontSize: '18px', marginBottom: '1rem' }}>Historique d&apos;activité</h2>
                  {d.activity.length === 0 && <p>Aucune activité enregistrée.</p>}
                  {d.activity.length > 0 && (
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                      {d.activity.map((entry: AdminDemandeActivityEntry) => {
                        let href: string | null = null;
                        if (entry.kind === 'offre') href = '/offres';
                        else if (entry.kind === 'commande') href = `/commandes/${encodeURIComponent(entry.id)}`;
                        else if (entry.kind === 'signalement') href = `/signalements/${encodeURIComponent(entry.id)}`;
                        else if (entry.kind === 'avis') href = '/avis';

                        const actorDisplay = entry.actorEmail
                          ? isDeletedUser(null, entry.actorEmail)
                            ? DELETED_USER_NAME
                            : entry.actorEmail
                          : '-';
                        const labelText =
                          entry.kind === 'admin' && entry.action
                            ? `${ADMIN_AUDIT_ACTION_LABEL[entry.action] ?? entry.action} par ${actorDisplay}`
                            : entry.label;

                        return (
                          <li
                            key={entry.id}
                            style={{
                              paddingBottom: '0.5rem',
                              marginBottom: '0.5rem',
                              borderBottom: '1px solid var(--line)',
                            }}
                          >
                            <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                              {new Date(entry.at).toLocaleString('fr-FR')}
                            </div>
                            <div>
                              {href ? (
                                <Link
                                  href={href}
                                  style={{
                                    color: 'var(--navy-text, #25324f)',
                                    fontWeight: 600,
                                    textDecoration: 'underline',
                                  }}
                                >
                                  {labelText}
                                </Link>
                              ) : (
                                labelText
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              {/* Right Column: Author Card & Administrative Actions */}
              <div data-testid="detail-grid-right">
                {/* Author */}
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                  <h2 style={{ fontSize: '18px', marginBottom: '1rem' }}>Auteur</h2>
                  <p>
                    <strong>Nom :</strong>{' '}
                    <Link href={`/utilisateurs/${d.author.userId}`}>
                      {isDeletedUser(d.author.name, d.author.email) ? DELETED_USER_NAME : d.author.name}
                    </Link>
                  </p>
                  <p>
                    <strong>E-mail :</strong>{' '}
                    {isDeletedUser(d.author.name, d.author.email) ? '— (Compte supprimé)' : (safeUserEmail(d.author.email) || '-')}
                  </p>
                </div>

                {/* Action forms (CF4-40: display only; the API refuses the routes to other roles) */}
                <Can p="content.moderate">
                  <DemandeActionForms
                    id={id}
                    categoryId={d.categoryId}
                    state={d.state}
                    paymentInFlight={d.paymentInFlight}
                    busy={busy}
                    act={act}
                  />
                </Can>
              </div>
            </div>
          </>
        );
      })()}
      {lightboxPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Aperçu de la photo"
          data-testid="photo-lightbox-modal"
          onClick={() => setLightboxPhoto(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              backgroundColor: 'var(--paper, #ffffff)',
              borderRadius: '8px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 16px',
                borderBottom: '1px solid var(--line, #dfe2e2)',
              }}
            >
              <a
                href={lightboxPhoto}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--navy-text, #25324f)',
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'underline',
                }}
              >
                Ouvrir l&apos;image originale ↗
              </a>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: 'var(--muted, #6b7280)',
                  padding: '4px 8px',
                }}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
            <div style={{ padding: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <img
                src={lightboxPhoto}
                alt="Aperçu agrandi"
                style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
