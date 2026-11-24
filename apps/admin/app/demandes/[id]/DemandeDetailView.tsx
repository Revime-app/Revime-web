'use client';

import React from 'react';
import {
  DEMANDE_STATUS_LABEL,
  type AdminDemandeDetail,
} from '@revime/shared';
import { formatEuros } from '../../../lib/money';
import { quoteClosedReasonLabel } from '../../../lib/quote-admin';

export const STATE_LABEL: Record<AdminDemandeDetail['state'], string> = {
  visible: 'Visible',
  masquee: 'Masquée',
  supprimee: 'Supprimée',
};

export const PARTS_LABEL: Record<AdminDemandeDetail['parts'], string> = {
  UNKNOWN: 'Non spécifié',
  ORIGINAL: "Pièces d'origine",
  COMPATIBLE: 'Pièces compatibles',
  CLIENT_SUPPLIED: 'Pièces fournies par le client',
};

export interface DemandeDetailViewProps {
  demande: AdminDemandeDetail;
  onLightboxPhoto?: (url: string) => void;
}

export function DemandeDetailView({ demande, onLightboxPhoto }: DemandeDetailViewProps) {
  const d = demande;

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <h2 style={{ fontSize: '18px', marginBottom: '1rem' }}>Contenu</h2>
      <p>
        <strong>Titre :</strong> {d.title}
      </p>
      <p>
        <strong>Description :</strong> {d.description}
      </p>
      <p>
        <strong>Marque :</strong> {d.brand || '-'}
      </p>
      <p>
        <strong>Modèle :</strong> {d.model || '-'}
      </p>
      <p>
        <strong>Pièces :</strong> {PARTS_LABEL[d.parts]}
      </p>
      <p>
        <strong>Mode :</strong> {d.mode === 'OFFERS' ? 'Offres' : 'Budget'}
      </p>
      {d.budgetCents !== null && (
        <p>
          <strong>Budget :</strong> {formatEuros(d.budgetCents)}
        </p>
      )}
      <p>
        <strong>Localisation :</strong> {d.locationLabel} ({d.postalCode})
      </p>
      <p>
        <strong>Catégorie :</strong> {d.categoryLabelFr}
      </p>
      {d.faultType && (
        <p>
          <strong>Type de panne :</strong>{' '}
          <span
            data-testid="demande-fault-type-badge"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: 'var(--navy-soft, #f0f1f5)',
              color: 'var(--navy-text, #25324f)',
              fontSize: '12px',
              fontWeight: 600,
              border: '1px solid var(--line, #dfe2e2)',
            }}
          >
            Panne : {d.faultType.labelFr}
          </span>
        </p>
      )}
      <p>
        <strong>Statut :</strong> {DEMANDE_STATUS_LABEL[d.status]}
      </p>
      {d.quoteTarget && (
        <p>
          <strong>Type :</strong> Demande de devis privée · {d.quoteTarget.displayName}
          {quoteClosedReasonLabel(d.quoteClosedReason) && ` · ${quoteClosedReasonLabel(d.quoteClosedReason)}`}
        </p>
      )}
      <p>
        <strong>État :</strong> {STATE_LABEL[d.state]}
        {d.state !== 'visible' && (d.removedByAdmin ? " par l'équipe" : ' par le client')}
      </p>
      {d.state !== 'visible' && d.removalReason && (
        <p>
          <strong>Motif :</strong> {d.removalReason}
        </p>
      )}
      <p>
        <strong>Créée le :</strong> {new Date(d.createdAt).toLocaleDateString('fr-FR')}
      </p>

      {/* Photos */}
      {d.photoUrls.length === 0 ? (
        <div className="demande__photos--empty" style={{ marginTop: '1rem' }} data-testid="demande-photos-empty">
          <strong>Photos :</strong>
          <p style={{ color: 'var(--muted, #6b7280)', fontStyle: 'italic', margin: '0.5rem 0 0' }}>
            Aucune photo jointe à cette demande
          </p>
        </div>
      ) : (
        <div className="demande__photos" style={{ marginTop: '1rem' }} data-testid="demande-photos-gallery">
          <strong>Photos :</strong>
          <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            {d.photoUrls.map((url, idx) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`demande-photo-${idx}`}
                onClick={(e) => {
                  e.preventDefault();
                  onLightboxPhoto?.(url);
                }}
                title="Cliquer pour agrandir"
                style={{
                  display: 'inline-block',
                  border: '1px solid var(--line, #dfe2e2)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  backgroundColor: 'var(--paper, #ffffff)',
                  cursor: 'pointer',
                  lineHeight: 0,
                }}
              >
                <img
                  src={url}
                  alt={`Photo ${idx + 1} de ${d.title}`}
                  style={{ width: '120px', height: '120px', objectFit: 'cover', display: 'block' }}
                />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
