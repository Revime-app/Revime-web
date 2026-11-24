'use client';

import React, { useState } from 'react';
import {
  ADMIN_ROLES,
  ADMIN_PERMISSIONS,
  ADMIN_ROLE_LABEL,
  ROLE_PERMISSIONS,
  type AdminRole,
  type AdminPermission,
} from '@revime/shared';

export const PERMISSION_LABELS: Record<AdminPermission, { name: string; description: string }> = {
  'dashboard.read': {
    name: 'Lecture du tableau de bord',
    description: 'Accès en lecture aux indicateurs clés, métriques globales et listes.',
  },
  'conversations.read': {
    name: 'Lecture des conversations',
    description: 'Consultation des échanges entre clients et réparateurs.',
  },
  'users.moderate': {
    name: 'Modération des utilisateurs',
    description: 'Suspension, réactivation, ajout de notes internes et communications.',
  },
  'users.delete': {
    name: 'Suppression de comptes',
    description: 'Suppression définitive avec confirmation double étape.',
  },
  'verification.decide': {
    name: 'Validation des vérifications',
    description: "Approbation et refus des justificatifs d'identité et de SIRET.",
  },
  'content.moderate': {
    name: 'Modération du contenu',
    description: 'Masquage et suppression des demandes, offres, avis et messages.',
  },
  'reports.handle': {
    name: 'Gestion des signalements',
    description: 'Prise en charge, libération et clôture des signalements utilisateurs.',
  },
  'disputes.handle': {
    name: 'Gestion des litiges',
    description: 'Ouverture, assignation, notes et messagerie tripartite de litige.',
  },
  'disputes.resolve': {
    name: 'Arbitrage des litiges',
    description: 'Décision finale : libération des fonds, remboursement ou rejet.',
  },
  'refunds.issue': {
    name: 'Émission de remboursements',
    description: 'Validation des demandes d’annulation et exécution des remboursements.',
  },
  'shipping.operate': {
    name: 'Opérations de livraison',
    description: 'Génération d’étiquettes et relance des expéditions Boxtal.',
  },
  'catalog.manage': {
    name: 'Gestion du catalogue',
    description: 'Création et mise à jour des catégories, marques, modèles et conseils.',
  },
  'admin.manage': {
    name: 'Administration & Équipe',
    description: 'Invitation, attribution des rôles, sécurité 2FA et révocation d’accès.',
  },
  'compliance.read': {
    name: 'Audit de conformité',
    description: 'Consultation et vérification cryptographique des preuves de consentement.',
  },
  'payments.manage': {
    name: 'Gestion des paiements',
    description: 'Suivi des transactions financières et abandon des paiements périmés.',
  },
};

export interface StaffPermissionsMatrixProps {
  defaultExpanded?: boolean;
}

export function StaffPermissionsMatrix({ defaultExpanded = false }: StaffPermissionsMatrixProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div
      data-testid="staff-permissions-matrix"
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        padding: '20px 24px',
        marginTop: '32px',
        fontFamily: 'var(--font-google-sans), Arial, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div>
          <h2
            style={{
              fontSize: '18px',
              fontWeight: 700,
              margin: '0 0 4px 0',
              color: 'var(--ink, #141414)',
            }}
          >
            Matrice des droits par rôle
          </h2>
          <p
            style={{
              fontSize: '14px',
              margin: 0,
              color: 'var(--muted, #6b7280)',
            }}
          >
            Répartition contractuelle des permissions d’administration selon les 6 rôles de la plateforme
          </p>
        </div>
        <button
          type="button"
          data-testid="toggle-permissions-matrix"
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((prev) => !prev);
          }}
          style={{
            padding: '6px 14px',
            fontSize: '13px',
            fontWeight: 600,
            backgroundColor: 'var(--paper, #ffffff)',
            color: 'var(--navy-text, #25324f)',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: 'var(--r-field, 4px)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {expanded ? '▲ Masquer la matrice' : '▼ Consulter la matrice'}
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: '20px', overflowX: 'auto' }}>
          <table
            className="table"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px',
            }}
          >
            <thead>
              <tr style={{ borderBottom: '2px solid var(--line, #dfe2e2)' }}>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    fontWeight: 700,
                    color: 'var(--ink, #141414)',
                    minWidth: '260px',
                  }}
                >
                  Permission / Capacité
                </th>
                {ADMIN_ROLES.map((role) => (
                  <th
                    key={role}
                    style={{
                      textAlign: 'center',
                      padding: '10px 8px',
                      fontWeight: 700,
                      color: 'var(--ink, #141414)',
                      minWidth: '100px',
                    }}
                  >
                    {ADMIN_ROLE_LABEL[role] ?? role}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ADMIN_PERMISSIONS.map((perm, idx) => {
                const info = PERMISSION_LABELS[perm];
                return (
                  <tr
                    key={perm}
                    style={{
                      borderBottom: '1px solid var(--line, #dfe2e2)',
                      backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--bg-subtle, rgba(0, 0, 0, 0.015))',
                    }}
                  >
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>
                        {info.name}
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--muted, #6b7280)',
                          marginTop: '2px',
                        }}
                      >
                        {info.description}
                      </div>
                    </td>
                    {ADMIN_ROLES.map((role) => {
                      const granted = ROLE_PERMISSIONS[role].includes(perm);
                      return (
                        <td
                          key={role}
                          style={{
                            textAlign: 'center',
                            padding: '10px 8px',
                            verticalAlign: 'middle',
                          }}
                        >
                          {granted ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                backgroundColor: 'var(--badge-success-bg)',
                                color: 'var(--badge-success-text)',
                                fontWeight: 700,
                                fontSize: '13px',
                              }}
                              title={`${ADMIN_ROLE_LABEL[role]} a la permission ${perm}`}
                            >
                              ✓
                            </span>
                          ) : (
                            <span
                              style={{
                                color: 'var(--muted, #9ca3af)',
                                fontSize: '14px',
                              }}
                            >
                              —
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
