'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { httpsUrlOrNull, type AdminTipItem, type AdminTipsResponse, type TipCategory } from '@revime/shared';
import { buildListQuery, createLatestGuard } from '../../lib/list-query';
import { periodLabel, TIP_POOL_LABEL } from '../../lib/tip-format';
import { TipForm } from './TipForm';
import { useAdminMe } from '../../components/AdminGate';
import { hasPermission } from '../../lib/permissions';
import { Lightbulb } from 'lucide-react';
import { Icon } from '../../components/Icon';

/**
 * CF4-38 & P23 « Conseils du jour ».
 * Deux pools (clients, réparateurs); statut dynamique de rotation et planification:
 * - Aujourd'hui (badge vert pour le conseil sélectionné aujourd'hui)
 * - En rotation (conseil actif dans sa période de validité)
 * - Programmé (période future)
 * - Expiré (période révolue)
 * - Désactivé (inactif)
 */

type Pool = 'CLIENT' | 'REPAIRER';
const TABS: { pool: Pool; label: string }[] = [
  { pool: 'CLIENT', label: 'Conseils clients' },
  { pool: 'REPAIRER', label: 'Conseils réparateurs' },
];

type View =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'loaded'; data: AdminTipsResponse };

export type TipRotationStatus = 'TODAY' | 'ROTATING' | 'SCHEDULED' | 'EXPIRED' | 'DISABLED';

export interface TipStatusBadgeConfig {
  label: string;
  bg: string;
  fg: string;
  status: TipRotationStatus;
}

export function getTipRotationStatus(tip: AdminTipItem, isToday: boolean): TipStatusBadgeConfig {
  if (isToday) {
    return {
      label: "Aujourd'hui",
      bg: 'var(--badge-success-bg)',
      fg: 'var(--badge-success-text)',
      status: 'TODAY',
    };
  }
  if (tip.state === 'ACTIVE') {
    return {
      label: 'En rotation',
      bg: 'var(--badge-info-bg)',
      fg: 'var(--badge-info-text)',
      status: 'ROTATING',
    };
  }
  if (tip.state === 'SCHEDULED') {
    return {
      label: 'Programmé',
      bg: 'var(--badge-info-bg)',
      fg: 'var(--badge-info-text)',
      status: 'SCHEDULED',
    };
  }
  if (tip.state === 'EXPIRED') {
    return {
      label: 'Expiré',
      bg: 'var(--badge-neutral-bg)',
      fg: 'var(--ink2)',
      status: 'EXPIRED',
    };
  }
  return {
    label: 'Désactivé',
    bg: 'var(--badge-warning-bg)',
    fg: 'var(--badge-warning-text)',
    status: 'DISABLED',
  };
}

const smallButton: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 13,
  fontWeight: 500,
  backgroundColor: 'var(--paper)',
  color: 'var(--navy-text, #25324f)',
  border: '1px solid var(--line, #dfe2e2)',
  borderRadius: 'var(--r-field, 4px)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontFamily: 'var(--font-google-sans), Arial, sans-serif',
};

export interface ConseilsTableProps {
  items: AdminTipItem[];
  todayId: string | null;
  canManage?: boolean;
  onEdit?: (tip: AdminTipItem) => void;
  onToggle?: (tip: AdminTipItem) => void;
  onRemove?: (tip: AdminTipItem) => void;
}

export function ConseilsTable({
  items,
  todayId,
  canManage = true,
  onEdit,
  onToggle,
  onRemove,
}: ConseilsTableProps) {
  if (items.length === 0) {
    return (
      <p style={{ color: 'var(--muted, #6b7280)', padding: '32px 0', textAlign: 'center' }}>
        Aucun conseil pour l&apos;instant.
      </p>
    );
  }

  return (
    <div
      style={{
        overflowX: 'auto',
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
      }}
    >
      <table className="table" style={{ width: '100%', minWidth: 840, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--line, #dfe2e2)', textAlign: 'left' }}>
            <th style={{ padding: '12px 14px', fontSize: 13, color: 'var(--muted, #6b7280)' }}>Texte &amp; Illustration</th>
            <th style={{ padding: '12px 14px', fontSize: 13, color: 'var(--muted, #6b7280)' }}>Destinataires</th>
            <th style={{ padding: '12px 14px', fontSize: 13, color: 'var(--muted, #6b7280)' }}>Période</th>
            <th style={{ padding: '12px 14px', fontSize: 13, color: 'var(--muted, #6b7280)' }}>État de rotation</th>
            <th style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, color: 'var(--muted, #6b7280)' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((tip) => {
            const isToday = tip.id === todayId;
            const status = getTipRotationStatus(tip, isToday);
            // rows written before the API checked URLs may hold a `javascript:` or `data:` address
            const imageUrl = httpsUrlOrNull(tip.imageUrl);
            const linkUrl = httpsUrlOrNull(tip.linkUrl);

            return (
              <tr
                key={tip.id}
                data-testid={`tip-row-${tip.id}`}
                style={{ borderBottom: '1px solid var(--line, #dfe2e2)' }}
              >
                <td style={{ padding: '12px 14px', maxWidth: 420 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    {imageUrl && (
                      <img
                        src={imageUrl}
                        alt=""
                        data-testid="tip-row-image"
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 6,
                          objectFit: 'cover',
                          flexShrink: 0,
                          border: '1px solid var(--line, #dfe2e2)',
                        }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: 'var(--ink2)' }}>{tip.text}</div>
                      {linkUrl && (
                        <a
                          href={linkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid="tip-row-link"
                          style={{
                            fontSize: 12,
                            color: 'var(--navy-text, #25324f)',
                            textDecoration: 'underline',
                            marginTop: 4,
                            display: 'inline-block',
                            wordBreak: 'break-all',
                          }}
                        >
                          {linkUrl}
                        </a>
                      )}
                    </div>
                  </div>
                </td>
                <td style={{ padding: '12px 14px', fontSize: 13 }}>
                  {TIP_POOL_LABEL[tip.category]}
                </td>
                <td style={{ padding: '12px 14px', fontSize: 13 }}>
                  {periodLabel(tip.startsAt, tip.endsAt)}
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <span
                    data-testid="tip-status-badge"
                    data-status={status.status}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      backgroundColor: status.bg,
                      color: status.fg,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {status.label}
                  </span>
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    <button
                      hidden={!canManage}
                      type="button"
                      style={smallButton}
                      onClick={() => onEdit?.(tip)}
                    >
                      Modifier
                    </button>
                    <button
                      hidden={!canManage}
                      type="button"
                      style={smallButton}
                      onClick={() => onToggle?.(tip)}
                    >
                      {tip.active ? 'Désactiver' : 'Activer'}
                    </button>
                    <button
                      hidden={!canManage}
                      type="button"
                      style={{ ...smallButton, color: 'var(--red-text, #bd0e26)' }}
                      onClick={() => onRemove?.(tip)}
                    >
                      Supprimer
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ConseilsPage() {
  const [pool, setPool] = useState<Pool>('CLIENT');
  const [view, setView] = useState<View>({ state: 'loading' });
  const [editing, setEditing] = useState<AdminTipItem | 'new' | null>(null);
  const adminMe = useAdminMe();
  const canManage = hasPermission(adminMe, 'catalog.manage');
  const [actionError, setActionError] = useState<string | null>(null);
  const guard = useRef(createLatestGuard());

  const load = useCallback(async () => {
    const n = guard.current.next();
    setView({ state: 'loading' });
    const qs = buildListQuery({ category: pool });
    try {
      const res = await fetch(`/api/proxy/admin/tips${qs}`);
      const data = await res.json();
      if (!guard.current.isLatest(n)) return;
      if (!res.ok) {
        setView({ state: 'error', message: data.error?.message || 'Impossible de charger les conseils.' });
        return;
      }
      setView({ state: 'loaded', data: data as AdminTipsResponse });
    } catch {
      if (!guard.current.isLatest(n)) return;
      setView({ state: 'error', message: 'Impossible de charger les conseils.' });
    }
  }, [pool]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(tip: AdminTipItem) {
    setActionError(null);
    try {
      const res = await fetch(`/api/proxy/admin/tips/${encodeURIComponent(tip.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !tip.active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setActionError(data?.error?.message || 'Impossible de modifier le conseil.');
        return;
      }
      void load();
    } catch {
      setActionError('Erreur réseau. Impossible de modifier le conseil.');
    }
  }

  async function remove(tip: AdminTipItem) {
    if (!window.confirm('Ce conseil sera supprimé définitivement.')) return;
    setActionError(null);
    try {
      const res = await fetch(`/api/proxy/admin/tips/${encodeURIComponent(tip.id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setActionError(data?.error?.message || 'Impossible de supprimer le conseil.');
        return;
      }
      if (editing !== 'new' && editing?.id === tip.id) setEditing(null);
      void load();
    } catch {
      setActionError('Erreur réseau. Impossible de supprimer le conseil.');
    }
  }

  const todayId = view.state === 'loaded' ? view.data.today[pool] : null;
  const todayTip = view.state === 'loaded' ? view.data.items.find((i) => i.id === todayId) : undefined;

  return (
    <div className="page page--wide" style={{ fontFamily: 'var(--font-google-sans), Arial, sans-serif' }}>
      <h1 style={{ color: 'var(--navy-text, #25324f)', marginBottom: 20 }}>Conseils du jour</h1>

      <div role="tablist" aria-label="Destinataires" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {TABS.map((t) => {
          const isSelected = pool === t.pool;
          return (
            <button
              key={t.pool}
              role="tab"
              type="button"
              aria-selected={isSelected}
              onClick={() => {
                setPool(t.pool);
                setEditing(null);
              }}
              style={{
                ...smallButton,
                fontSize: 14,
                padding: '8px 16px',
                backgroundColor: isSelected ? 'var(--navy, #25324f)' : 'var(--paper)',
                color: isSelected ? '#ffffff' : 'var(--navy-text, #25324f)',
                fontWeight: isSelected ? 600 : 500,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {view.state === 'loaded' && (
        <div
          data-testid="today-tip-banner"
          style={{
            padding: '14px 18px',
            backgroundColor: 'var(--paper, #ffffff)',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: 'var(--r-card, 8px)',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 18 }} aria-hidden="true"><Icon as={Lightbulb} /></span>
          <div>
            {todayTip ? (
              <span>
                <strong style={{ color: 'var(--badge-success-text)' }}>Aujourd&apos;hui en ligne : </strong>
                <span>{todayTip.text}</span>
              </span>
            ) : (
              <span style={{ color: 'var(--muted, #6b7280)' }}>
                Aucun conseil affiché aujourd&apos;hui
              </span>
            )}
          </div>
        </div>
      )}

      {editing === null ? (
        <button
          hidden={!canManage}
          type="button"
          onClick={() => setEditing('new')}
          style={{
            ...smallButton,
            fontSize: 14,
            padding: '8px 18px',
            marginBottom: 16,
            backgroundColor: 'var(--navy, #25324f)',
            color: '#ffffff',
            fontWeight: 600,
          }}
        >
          Ajouter un conseil
        </button>
      ) : (
        <TipForm
          key={editing === 'new' ? 'new' : editing.id}
          tip={editing === 'new' ? null : editing}
          defaultCategory={pool}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      {actionError && (
        <p role="alert" style={{ color: 'var(--red-text, #bd0e26)', marginBottom: 12 }}>
          {actionError}
        </p>
      )}

      {view.state === 'loading' && <p style={{ color: 'var(--muted, #6b7280)' }}>Chargement des conseils…</p>}
      {view.state === 'error' && (
        <p role="alert" style={{ color: 'var(--red-text, #bd0e26)' }}>
          {view.message}
        </p>
      )}

      {view.state === 'loaded' && (
        <ConseilsTable
          items={view.data.items}
          todayId={todayId}
          canManage={canManage}
          onEdit={(tip) => setEditing(tip)}
          onToggle={(tip) => void toggle(tip)}
          onRemove={(tip) => void remove(tip)}
        />
      )}
    </div>
  );
}
