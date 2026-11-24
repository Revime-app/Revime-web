'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ADMIN_AUDIT_ACTION_LABEL,
  type AdminUserActivityEntry,
  type AdminUserDetail,
} from '@revime/shared';
import { formatEuros } from '../lib/money';
import { formatAuditStatus } from './RecentActions';
import { isDeletedUser, DELETED_USER_NAME } from '../lib/user-display';
import { commandeStatusLabel, storedDisputeStatusLabel } from '../lib/status-labels';
import { Star } from 'lucide-react';
import { Icon } from './Icon';

export function getActivityEntryHref(entry: AdminUserActivityEntry): string | null {
  switch (entry.kind) {
    case 'demande':
      return `/demandes/${encodeURIComponent(entry.id)}`;
    case 'commande':
      return `/commandes/${encodeURIComponent(entry.id)}`;
    case 'signalement':
      return `/signalements/${encodeURIComponent(entry.id)}`;
    case 'offre':
      return `/offres`;
    case 'avis':
      return `/avis`;
    default:
      return null;
  }
}

export type TabKey =
  | 'activite'
  | 'commandes'
  | 'paiements'
  | 'litiges'
  | 'avis'
  | 'signalements'
  | 'connexions';

export interface UserDetailTabsProps {
  history: AdminUserActivityEntry[];
  tabsData?: AdminUserDetail['tabsData'];
  initialTab?: TabKey;
}

export function UserDetailTabs({
  history,
  tabsData,
  initialTab = 'activite',
}: UserDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  const tabs: Array<{ id: TabKey; label: string; count?: number }> = [
    { id: 'activite', label: 'Activité', count: history.length },
    { id: 'commandes', label: 'Commandes', count: tabsData?.orders?.length },
    { id: 'paiements', label: 'Paiements', count: tabsData?.payments?.length },
    { id: 'litiges', label: 'Litiges', count: tabsData?.disputes?.length },
    { id: 'avis', label: 'Avis', count: tabsData?.reviews?.length },
    { id: 'signalements', label: 'Signalements', count: tabsData?.reports?.length },
    { id: 'connexions', label: 'Connexions', count: tabsData?.sessions?.length },
  ];

  return (
    <div
      className="card"
      data-testid="user-detail-tabs"
      style={{
        marginBottom: '1.5rem',
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: '12px',
        padding: '20px',
        fontFamily: 'var(--font-google-sans), Arial, sans-serif',
      }}
    >
      {/* Tab Navigation */}
      <div
        role="tablist"
        aria-label="Navigation des détails utilisateur"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          borderBottom: '1px solid var(--line, #dfe2e2)',
          paddingBottom: '12px',
          marginBottom: '20px',
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-controls={`panel-${tab.id}`}
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              style={{
                backgroundColor: isActive ? 'var(--navy, #25324f)' : 'transparent',
                color: isActive ? '#ffffff' : 'var(--ink, #141414)',
                border: '1px solid',
                borderColor: isActive ? 'var(--navy, #25324f)' : 'transparent',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  style={{
                    backgroundColor: isActive ? 'rgba(255, 255, 255, 0.2)' : 'var(--line, #dfe2e2)',
                    color: isActive ? '#ffffff' : 'var(--muted, #6b7280)',
                    borderRadius: '999px',
                    padding: '2px 7px',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="tab-content">
        {/* 1. Activité */}
        {activeTab === 'activite' && (
          <div role="tabpanel" id="panel-activite" aria-labelledby="tab-activite" data-testid="panel-activite">
            <h2 style={{ fontSize: '18px', marginBottom: '1rem' }}>Historique d&apos;activité</h2>
            {history.length === 0 ? (
              <p style={{ color: 'var(--muted, #6b7280)', margin: 0 }}>Aucune activité enregistrée.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {history.map((entry) => {
                  const href = getActivityEntryHref(entry);
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
                        paddingBottom: '12px',
                        marginBottom: '12px',
                        borderBottom: '1px solid var(--line, #dfe2e2)',
                      }}
                    >
                      <div style={{ fontSize: '12px', color: 'var(--muted, #6b7280)', marginBottom: '4px' }}>
                        {new Date(entry.at).toLocaleString('fr-FR')}
                      </div>
                      <div style={{ fontSize: '14px' }}>
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
                        {entry.kind === 'admin' &&
                          entry.statusCode !== undefined &&
                          entry.statusCode >= 400 && (
                            <span style={{ color: 'var(--red, #f61b39)', fontWeight: 600 }}>
                              {' '}
                              ({formatAuditStatus(entry.statusCode)})
                            </span>
                          )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* 2. Commandes */}
        {activeTab === 'commandes' && (
          <div role="tabpanel" id="panel-commandes" aria-labelledby="tab-commandes" data-testid="panel-commandes">
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Commandes</h2>
            {!tabsData?.orders || tabsData.orders.length === 0 ? (
              <p style={{ color: 'var(--muted, #6b7280)', margin: 0 }}>Aucune commande enregistrée.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line, #dfe2e2)', textAlign: 'left', color: 'var(--muted, #6b7280)' }}>
                    <th style={{ padding: '8px 12px' }}>Date</th>
                    <th style={{ padding: '8px 12px' }}>Rôle</th>
                    <th style={{ padding: '8px 12px' }}>Demande</th>
                    <th style={{ padding: '8px 12px' }}>Montant</th>
                    <th style={{ padding: '8px 12px' }}>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {tabsData.orders.map((o) => (
                    <tr key={o.id} style={{ borderBottom: '1px solid var(--line, #dfe2e2)' }}>
                      <td style={{ padding: '10px 12px' }}>{new Date(o.createdAt).toLocaleDateString('fr-FR')}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontWeight: 600 }}>{o.role === 'CLIENT' ? 'Client' : 'Réparateur'}</span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Link
                          href={`/commandes/${encodeURIComponent(o.id)}`}
                          style={{ color: 'var(--navy-text, #25324f)', fontWeight: 600, textDecoration: 'underline' }}
                        >
                          {o.title}
                        </Link>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{formatEuros(o.totalCents)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: o.status === 'PAID' ? 'var(--badge-success-bg)' : 'var(--badge-neutral-bg)',
                            color: o.status === 'PAID' ? 'var(--badge-success-text)' : 'var(--ink2)',
                          }}
                        >
                          {commandeStatusLabel(o.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* 3. Paiements */}
        {activeTab === 'paiements' && (
          <div role="tabpanel" id="panel-paiements" aria-labelledby="tab-paiements" data-testid="panel-paiements">
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Paiements</h2>
            {!tabsData?.payments || tabsData.payments.length === 0 ? (
              <p style={{ color: 'var(--muted, #6b7280)', margin: 0 }}>Aucun paiement enregistré.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line, #dfe2e2)', textAlign: 'left', color: 'var(--muted, #6b7280)' }}>
                    <th style={{ padding: '8px 12px' }}>Date</th>
                    <th style={{ padding: '8px 12px' }}>Commande</th>
                    <th style={{ padding: '8px 12px' }}>Montant</th>
                    <th style={{ padding: '8px 12px' }}>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {tabsData.payments.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--line, #dfe2e2)' }}>
                      <td style={{ padding: '10px 12px' }}>{new Date(p.createdAt).toLocaleDateString('fr-FR')}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <Link
                          href={`/commandes/${encodeURIComponent(p.commandeId)}`}
                          style={{ color: 'var(--navy-text, #25324f)', textDecoration: 'underline' }}
                        >
                          {p.commandeId}
                        </Link>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{formatEuros(p.amountCents)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: p.status === 'PAID' ? 'var(--badge-success-bg)' : 'var(--badge-neutral-bg)',
                            color: p.status === 'PAID' ? 'var(--badge-success-text)' : 'var(--ink2)',
                          }}
                        >
                          {commandeStatusLabel(p.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* 4. Litiges */}
        {activeTab === 'litiges' && (
          <div role="tabpanel" id="panel-litiges" aria-labelledby="tab-litiges" data-testid="panel-litiges">
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Litiges</h2>
            {!tabsData?.disputes || tabsData.disputes.length === 0 ? (
              <p style={{ color: 'var(--muted, #6b7280)', margin: 0 }}>Aucun litige enregistré.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line, #dfe2e2)', textAlign: 'left', color: 'var(--muted, #6b7280)' }}>
                    <th style={{ padding: '8px 12px' }}>N°</th>
                    <th style={{ padding: '8px 12px' }}>Motif</th>
                    <th style={{ padding: '8px 12px' }}>Date</th>
                    <th style={{ padding: '8px 12px' }}>Statut</th>
                    <th style={{ padding: '8px 12px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tabsData.disputes.map((d) => (
                    <tr key={d.id} style={{ borderBottom: '1px solid var(--line, #dfe2e2)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>#{d.number}</td>
                      <td style={{ padding: '10px 12px' }}>{d.reason}</td>
                      <td style={{ padding: '10px 12px' }}>{new Date(d.createdAt).toLocaleDateString('fr-FR')}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: d.status === 'OPEN' ? 'var(--badge-danger-bg)' : 'var(--badge-neutral-bg)',
                            color: d.status === 'OPEN' ? 'var(--badge-danger-text)' : 'var(--ink2)',
                          }}
                        >
                          {storedDisputeStatusLabel(d.status)}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Link
                          href={`/litiges?disputeId=${encodeURIComponent(d.id)}`}
                          style={{ color: 'var(--navy-text, #25324f)', fontWeight: 600, textDecoration: 'underline' }}
                        >
                          Voir dossier
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* 5. Avis */}
        {activeTab === 'avis' && (
          <div role="tabpanel" id="panel-avis" aria-labelledby="tab-avis" data-testid="panel-avis">
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Avis</h2>
            {!tabsData?.reviews || tabsData.reviews.length === 0 ? (
              <p style={{ color: 'var(--muted, #6b7280)', margin: 0 }}>Aucun avis enregistré.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {tabsData.reviews.map((r) => (
                  <li
                    key={r.id}
                    style={{
                      paddingBottom: '12px',
                      marginBottom: '12px',
                      borderBottom: '1px solid var(--line, #dfe2e2)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, color: 'var(--navy-text, #25324f)' }}><Icon as={Star} /> {r.rating}/5</span>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: r.role === 'RECEIVED' ? 'var(--badge-info-bg)' : 'var(--badge-neutral-bg)',
                          color: r.role === 'RECEIVED' ? 'var(--badge-info-text)' : 'var(--ink2)',
                          fontWeight: 600,
                        }}
                      >
                        {r.role === 'RECEIVED' ? 'Avis reçu' : 'Avis écrit'}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}>
                        {new Date(r.createdAt).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                    {r.comment && <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>« {r.comment} »</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* 6. Signalements */}
        {activeTab === 'signalements' && (
          <div role="tabpanel" id="panel-signalements" aria-labelledby="tab-signalements" data-testid="panel-signalements">
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Signalements</h2>
            {!tabsData?.reports || tabsData.reports.length === 0 ? (
              <p style={{ color: 'var(--muted, #6b7280)', margin: 0 }}>Aucun signalement enregistré.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {tabsData.reports.map((rep) => (
                  <li
                    key={rep.id}
                    style={{
                      paddingBottom: '12px',
                      marginBottom: '12px',
                      borderBottom: '1px solid var(--line, #dfe2e2)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: rep.role === 'AGAINST' ? 'var(--badge-danger-bg)' : 'var(--badge-warning-bg)',
                          color: rep.role === 'AGAINST' ? 'var(--badge-danger-text)' : 'var(--badge-warning-text)',
                          fontWeight: 600,
                        }}
                      >
                        {rep.role === 'AGAINST' ? 'Signalement reçu' : 'Signalement émis'}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}>
                        {new Date(rep.createdAt).toLocaleDateString('fr-FR')}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: rep.resolvedAt ? 'var(--badge-success-bg)' : 'var(--badge-neutral-bg)',
                          color: rep.resolvedAt ? 'var(--badge-success-text)' : 'var(--ink2)',
                        }}
                      >
                        {rep.resolvedAt ? 'Traité' : 'En attente'}
                      </span>
                    </div>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>{rep.reason}</p>
                    {rep.conversationId && (
                      <div style={{ marginTop: '4px' }}>
                        <Link
                          href={`/signalements/${encodeURIComponent(rep.id)}`}
                          style={{ color: 'var(--navy-text, #25324f)', fontSize: '12px', textDecoration: 'underline' }}
                        >
                          Voir la conversation
                        </Link>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* 7. Connexions */}
        {activeTab === 'connexions' && (
          <div role="tabpanel" id="panel-connexions" aria-labelledby="tab-connexions" data-testid="panel-connexions">
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Connexions</h2>
            {!tabsData?.sessions || tabsData.sessions.length === 0 ? (
              <p style={{ color: 'var(--muted, #6b7280)', margin: 0 }}>Aucune session enregistrée.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line, #dfe2e2)', textAlign: 'left', color: 'var(--muted, #6b7280)' }}>
                    <th style={{ padding: '8px 12px' }}>Date</th>
                    <th style={{ padding: '8px 12px' }}>Adresse IP</th>
                    <th style={{ padding: '8px 12px' }}>Navigateur / Client</th>
                  </tr>
                </thead>
                <tbody>
                  {tabsData.sessions.map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--line, #dfe2e2)' }}>
                      <td style={{ padding: '10px 12px' }}>{new Date(s.createdAt).toLocaleString('fr-FR')}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{s.ipAddress || '—'}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--muted, #6b7280)' }}>{s.userAgent || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
