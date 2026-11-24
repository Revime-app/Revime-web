'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ADMIN_ROLE_LABEL,
  type StaffMemberItem,
  type StaffInvitationItem,
  type StaffInvitationsListResponse,
  type StaffInvitationStatus,
} from '@revime/shared';
import { useAdminMe } from '../../components/AdminGate';
import { hasPermission } from '../../lib/permissions';
import { ListPagination } from '../../components/ListPagination';
import { StaffPermissionsMatrix } from '../../components/StaffPermissionsMatrix';
import { InviteStaffModal } from './InviteStaffModal';
import { EditRoleModal } from './EditRoleModal';

export function getTwoFactorBadge(enabled: boolean): { label: string; tone: 'success' | 'warning' } {
  return enabled
    ? { label: 'Activée', tone: 'success' }
    : { label: 'En attente', tone: 'warning' };
}

export function getInvitationStatusBadge(status: StaffInvitationStatus): {
  label: string;
  tone: 'warning' | 'success' | 'danger' | 'muted';
} {
  switch (status) {
    case 'PENDING':
      return { label: 'En attente', tone: 'warning' };
    case 'ACCEPTED':
      return { label: 'Acceptée', tone: 'success' };
    case 'REVOKED':
      return { label: 'Révoquée', tone: 'danger' };
    case 'EXPIRED':
      return { label: 'Expirée', tone: 'muted' };
    default:
      return { label: status, tone: 'muted' };
  }
}

export function formatLastLogin(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export async function sendResendInvitationRequest(
  invitationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/proxy/admin/staff/invitations/${encodeURIComponent(invitationId)}/resend`, {
      method: 'POST',
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error?.message ?? data?.message ?? 'Impossible de renvoyer l’e-mail.',
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Erreur réseau lors du renvoi.' };
  }
}

export async function sendRevokeInvitationRequest(
  invitationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/proxy/admin/staff/invitations/${encodeURIComponent(invitationId)}`, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error?.message ?? data?.message ?? 'Impossible de révoquer l’invitation.',
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Erreur réseau lors de la révocation.' };
  }
}

export async function sendResetTwoFactorRequest(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/proxy/admin/users/${encodeURIComponent(userId)}/two-factor/reset`, {
      method: 'POST',
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error?.message ?? data?.message ?? 'Impossible de réinitialiser la double authentification.',
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Erreur réseau lors de la réinitialisation de la double authentification.' };
  }
}

export async function sendRemoveMemberRequest(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/proxy/admin/staff/members/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error?.message ?? data?.message ?? 'Impossible de retirer ce collaborateur de l’équipe.',
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Erreur réseau lors de la suppression du collaborateur.' };
  }
}

function badgeStyle(tone: 'success' | 'warning' | 'danger' | 'muted'): React.CSSProperties {
  switch (tone) {
    case 'success':
      return {
        display: 'inline-block',
        padding: '3px 8px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: 'var(--badge-success-bg)',
        color: 'var(--badge-success-text)',
      };
    case 'warning':
      return {
        display: 'inline-block',
        padding: '3px 8px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: 'var(--badge-warning-bg)',
        color: 'var(--badge-warning-text)',
      };
    case 'danger':
      return {
        display: 'inline-block',
        padding: '3px 8px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: 'var(--red-soft, #fce8e6)',
        color: 'var(--red-text, #c5221f)',
      };
    case 'muted':
    default:
      return {
        display: 'inline-block',
        padding: '3px 8px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: 'var(--badge-neutral-bg)',
        color: 'var(--muted)',
      };
  }
}

export function StaffMembersTable({
  members,
  onEditRole,
  onReset2FA,
  onRemoveMember,
  actionPendingId,
}: {
  members: StaffMemberItem[];
  onEditRole: (member: StaffMemberItem) => void;
  onReset2FA: (member: StaffMemberItem) => void;
  onRemoveMember?: (member: StaffMemberItem) => void;
  actionPendingId: string | null;
}) {
  if (members.length === 0) {
    return <p style={{ color: 'var(--muted)' }}>Aucun collaborateur actif trouvé.</p>;
  }

  return (
    <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
      <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Nom & Prénom</th>
            <th>E-mail</th>
            <th>Rôle</th>
            <th>Double authentification</th>
            <th>Dernière connexion</th>
            <th>Inscrit le</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const displayName =
              [m.firstName, m.lastName].filter(Boolean).join(' ') ||
              m.name ||
              '—';
            const tfaBadge = getTwoFactorBadge(m.twoFactorEnabled);
            const isBusy = actionPendingId === m.id;

            return (
              <tr key={m.id}>
                <td style={{ fontWeight: 600 }}>{displayName}</td>
                <td>{m.email}</td>
                <td>
                  <span style={badgeStyle('muted')}>
                    {ADMIN_ROLE_LABEL[m.role] ?? m.role}
                  </span>
                </td>
                <td>
                  <span style={badgeStyle(tfaBadge.tone)}>{tfaBadge.label}</span>
                </td>
                <td data-testid={`last-login-${m.id}`} style={{ fontSize: '13px', color: m.lastLoginAt ? 'inherit' : 'var(--muted)' }}>
                  {formatLastLogin(m.lastLoginAt)}
                </td>
                <td>{new Date(m.createdAt).toLocaleDateString('fr-FR')}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button
                    type="button"
                    onClick={() => onEditRole(m)}
                    disabled={isBusy}
                    style={{
                      padding: '6px 12px',
                      fontSize: '13px',
                      marginRight: '8px',
                      background: 'var(--paper)',
                      color: 'var(--ink)',
                      border: '1px solid var(--line)',
                      cursor: 'pointer',
                    }}
                  >
                    Modifier le rôle
                  </button>
                  <button
                    type="button"
                    onClick={() => onReset2FA(m)}
                    disabled={isBusy}
                    style={{
                      padding: '6px 12px',
                      fontSize: '13px',
                      marginRight: '8px',
                      background: 'var(--paper)',
                      color: 'var(--red-text)',
                      border: '1px solid var(--line)',
                      cursor: isBusy ? 'wait' : 'pointer',
                    }}
                  >
                    {isBusy ? 'En cours...' : 'Réinitialiser 2FA'}
                  </button>
                  <button
                    type="button"
                    data-testid={`remove-member-${m.id}`}
                    onClick={() => onRemoveMember?.(m)}
                    disabled={isBusy}
                    style={{
                      padding: '6px 12px',
                      fontSize: '13px',
                      background: 'var(--paper)',
                      color: 'var(--red-text)',
                      border: '1px solid var(--line)',
                      cursor: isBusy ? 'wait' : 'pointer',
                    }}
                  >
                    {isBusy ? 'En cours...' : 'Retirer de l’équipe'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function InvitationsTable({
  invitations,
  onResend,
  onRevoke,
  actionPendingId,
}: {
  invitations: StaffInvitationItem[];
  onResend: (id: string) => void;
  onRevoke: (id: string) => void;
  actionPendingId: string | null;
}) {
  if (invitations.length === 0) {
    return <p style={{ color: 'var(--muted)' }}>Aucune invitation en cours.</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>E-mail</th>
            <th>Rôle proposé</th>
            <th>Invité par</th>
            <th>Expire le</th>
            <th>Statut</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {invitations.map((inv) => {
            const statusBadge = getInvitationStatusBadge(inv.status);
            const invitedByName = inv.invitedBy?.name || inv.invitedBy?.email || '—';
            const isPending = inv.status === 'PENDING';
            const isBusy = actionPendingId === inv.id;

            const nameDetail = [inv.firstName, inv.lastName].filter(Boolean).join(' ');

            return (
              <tr key={inv.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{inv.email}</div>
                  {nameDetail && (
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{nameDetail}</div>
                  )}
                </td>
                <td>
                  <span style={badgeStyle('muted')}>
                    {ADMIN_ROLE_LABEL[inv.role] ?? inv.role}
                  </span>
                </td>
                <td>{invitedByName}</td>
                <td>{new Date(inv.expiresAt).toLocaleDateString('fr-FR')}</td>
                <td>
                  <span style={badgeStyle(statusBadge.tone)}>{statusBadge.label}</span>
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {isPending ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onResend(inv.id)}
                        disabled={isBusy}
                        style={{
                          padding: '6px 12px',
                          fontSize: '13px',
                          marginRight: '8px',
                          background: 'var(--paper)',
                          color: 'var(--ink)',
                          border: '1px solid var(--line)',
                          cursor: isBusy ? 'wait' : 'pointer',
                        }}
                      >
                        {isBusy ? 'Envoi...' : 'Renvoyer l’e-mail'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRevoke(inv.id)}
                        disabled={isBusy}
                        style={{
                          padding: '6px 12px',
                          fontSize: '13px',
                          background: 'var(--paper)',
                          color: 'var(--red-text)',
                          border: '1px solid var(--line)',
                          cursor: isBusy ? 'wait' : 'pointer',
                        }}
                      >
                        {isBusy ? 'Révocation...' : 'Révoquer'}
                      </button>
                    </>
                  ) : (
                    <span style={{ color: 'var(--muted)', fontSize: '13px' }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export interface EquipePageViewProps {
  members: StaffMemberItem[];
  invitations: StaffInvitationItem[];
  loading: boolean;
  error: string | null;
  feedback: string | null;
  onOpenInviteModal: () => void;
  onEditRole: (member: StaffMemberItem) => void;
  onReset2FA: (member: StaffMemberItem) => void;
  onResendInvitation: (id: string) => void;
  onRevokeInvitation: (id: string) => void;
  actionPendingId: string | null;
  // P7 Search & Pagination additions
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  onSearchSubmit?: () => void;
  page?: number;
  pageSize?: number;
  totalMembers?: number;
  onPageChange?: (newPage: number) => void;
  onPageSizeChange?: (newPageSize: number) => void;
  onRemoveMember?: (member: StaffMemberItem) => void;
}

export function EquipePageView({
  members,
  invitations,
  loading,
  error,
  feedback,
  onOpenInviteModal,
  onEditRole,
  onReset2FA,
  onResendInvitation,
  onRevokeInvitation,
  actionPendingId,
  searchQuery = '',
  onSearchChange,
  onSearchSubmit,
  page = 1,
  pageSize = 20,
  totalMembers,
  onPageChange,
  onPageSizeChange,
  onRemoveMember,
}: EquipePageViewProps) {
  const displayTotal = totalMembers ?? members.length;

  return (
    <div className="page page--wide">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 6px 0' }}>Équipe</h1>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '15px' }}>
            Gestion des collaborateurs, attributions de rôles et invitations
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenInviteModal}
          style={{
            padding: '10px 18px',
            backgroundColor: 'var(--navy, #25324f)',
            color: 'var(--on-accent, #ffffff)',
            border: 'none',
            borderRadius: 'var(--r-field, 4px)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Inviter un collaborateur
        </button>
      </div>

      {feedback && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--badge-success-bg)',
            color: 'var(--badge-success-text)',
            borderRadius: 'var(--r-field, 4px)',
            marginBottom: '20px',
            fontWeight: 500,
          }}
        >
          {feedback}
        </div>
      )}

      {error && (
        <div role="alert" style={{ marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <p>Chargement...</p>
      ) : (
        <>
          <section style={{ marginBottom: '40px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                marginBottom: '16px',
              }}
            >
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
                {`Collaborateurs actifs (${displayTotal})`}
              </h2>

              {onSearchChange && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="search"
                    data-testid="staff-search-input"
                    aria-label="Rechercher un collaborateur"
                    placeholder="Rechercher par nom ou e-mail..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && onSearchSubmit) {
                        onSearchSubmit();
                      }
                    }}
                    style={{
                      padding: '8px 12px',
                      fontSize: '13px',
                      border: '1px solid var(--line, #dfe2e2)',
                      borderRadius: 'var(--r-field, 4px)',
                      width: '280px',
                      maxWidth: '100%',
                      backgroundColor: 'var(--paper, #ffffff)',
                      color: 'var(--ink, #141414)',
                    }}
                  />
                  {onSearchSubmit && (
                    <button
                      type="button"
                      data-testid="staff-search-submit"
                      onClick={onSearchSubmit}
                      style={{
                        padding: '8px 14px',
                        fontSize: '13px',
                        fontWeight: 600,
                        backgroundColor: 'var(--navy, #25324f)',
                        color: 'var(--on-accent, #ffffff)',
                        border: 'none',
                        borderRadius: 'var(--r-field, 4px)',
                        cursor: 'pointer',
                      }}
                    >
                      Rechercher
                    </button>
                  )}
                </div>
              )}
            </div>

            <StaffMembersTable
              members={members}
              onEditRole={onEditRole}
              onReset2FA={onReset2FA}
              onRemoveMember={onRemoveMember}
              actionPendingId={actionPendingId}
            />

            {onPageChange && displayTotal > 0 && (
              <ListPagination
                page={page}
                pageSize={pageSize}
                total={displayTotal}
                noun="collaborateur"
                pluralNoun="collaborateurs"
                onPageChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
              />
            )}
          </section>

          <section style={{ marginBottom: '40px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--ink)' }}>
              {`Invitations (${invitations.length})`}
            </h2>
            <InvitationsTable
              invitations={invitations}
              onResend={onResendInvitation}
              onRevoke={onRevokeInvitation}
              actionPendingId={actionPendingId}
            />
          </section>

          <StaffPermissionsMatrix />
        </>
      )}
    </div>
  );
}

export default function EquipePage() {
  const me = useAdminMe();
  const canManage = hasPermission(me, 'admin.manage');

  const [members, setMembers] = useState<StaffMemberItem[]>([]);
  const [invitations, setInvitations] = useState<StaffInvitationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalMembers, setTotalMembers] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [editRoleMember, setEditRoleMember] = useState<StaffMemberItem | null>(null);
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);

  // Debounced search trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setAppliedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const staffParams = new URLSearchParams();
      staffParams.set('page', String(page));
      staffParams.set('pageSize', String(pageSize));
      if (appliedSearch.trim()) {
        staffParams.set('q', appliedSearch.trim());
      }

      const [resMembers, resInvitations] = await Promise.all([
        fetch(`/api/proxy/admin/staff/members?${staffParams.toString()}`),
        fetch('/api/proxy/admin/staff/invitations'),
      ]);

      if (!resMembers.ok || !resInvitations.ok) {
        setError('Impossible de charger les données de l’équipe.');
        setLoading(false);
        return;
      }

      const membersData = await resMembers.json();
      const invitationsData = (await resInvitations.json()) as StaffInvitationsListResponse;

      if (Array.isArray(membersData)) {
        setMembers(membersData);
        setTotalMembers(membersData.length);
      } else if (membersData && Array.isArray(membersData.items)) {
        setMembers(membersData.items);
        setTotalMembers(membersData.total ?? membersData.items.length);
      } else {
        setMembers([]);
        setTotalMembers(0);
      }

      setInvitations(invitationsData?.items ?? []);
    } catch {
      setError('Erreur réseau. Impossible de charger l’équipe.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, appliedSearch]);

  useEffect(() => {
    if (canManage) {
      void loadData();
    }
  }, [canManage, loadData]);

  if (me && !canManage) {
    return (
      <div className="page page--wide">
        <h1>Accès réservé</h1>
        <p role="alert">
          Vous devez disposer du rôle Super Admin pour gérer l’équipe et les invitations.
        </p>
      </div>
    );
  }

  async function handleResendInvitation(id: string) {
    setActionPendingId(id);
    setError(null);
    setFeedback(null);

    const result = await sendResendInvitationRequest(id);
    setActionPendingId(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setFeedback('E-mail d’invitation renvoyé avec succès.');
    void loadData();
  }

  async function handleRevokeInvitation(id: string) {
    if (!window.confirm('Êtes-vous sûr de vouloir révoquer cette invitation ? Le lien ne sera plus valide.')) {
      return;
    }

    setActionPendingId(id);
    setError(null);
    setFeedback(null);

    const result = await sendRevokeInvitationRequest(id);
    setActionPendingId(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setFeedback('Invitation révoquée avec succès.');
    void loadData();
  }

  async function handleReset2FA(member: StaffMemberItem) {
    const memberName =
      [member.firstName, member.lastName].filter(Boolean).join(' ') ||
      member.name ||
      member.email;

    if (
      !window.confirm(
        `Réinitialiser la double authentification pour ${memberName} ? Ses sessions actives seront immédiatement fermées.`,
      )
    ) {
      return;
    }

    setActionPendingId(member.id);
    setError(null);
    setFeedback(null);

    const result = await sendResetTwoFactorRequest(member.id);
    setActionPendingId(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setFeedback('Double authentification réinitialisée avec succès. Ses sessions ont été fermées.');
    void loadData();
  }

  async function handleRemoveMember(member: StaffMemberItem) {
    const memberName =
      [member.firstName, member.lastName].filter(Boolean).join(' ') ||
      member.name ||
      member.email;

    if (
      !window.confirm(
        'Êtes-vous sûr de vouloir retirer ce collaborateur de l\'équipe ? Ses accès administrateur seront révoqués et ses sessions fermées.',
      )
    ) {
      return;
    }

    setActionPendingId(member.id);
    setError(null);
    setFeedback(null);

    const result = await sendRemoveMemberRequest(member.id);
    setActionPendingId(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setFeedback(`${memberName} a été retiré de l’équipe avec succès.`);
    void loadData();
  }

  const handleSearchSubmit = () => {
    setPage(1);
    setAppliedSearch(searchQuery);
  };

  return (
    <>
      <EquipePageView
        members={members}
        invitations={invitations}
        loading={loading}
        error={error}
        feedback={feedback}
        onOpenInviteModal={() => {
          setError(null);
          setFeedback(null);
          setInviteModalOpen(true);
        }}
        onEditRole={(m) => {
          setError(null);
          setFeedback(null);
          setEditRoleMember(m);
        }}
        onReset2FA={handleReset2FA}
        onResendInvitation={handleResendInvitation}
        onRevokeInvitation={handleRevokeInvitation}
        actionPendingId={actionPendingId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={handleSearchSubmit}
        page={page}
        pageSize={pageSize}
        totalMembers={totalMembers}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(1);
        }}
        onRemoveMember={handleRemoveMember}
      />

      <InviteStaffModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        onSuccess={(msg) => {
          if (msg) setFeedback(msg);
          void loadData();
        }}
      />

      <EditRoleModal
        member={editRoleMember}
        onClose={() => setEditRoleMember(null)}
        onSuccess={(msg) => {
          if (msg) setFeedback(msg);
          void loadData();
        }}
      />
    </>
  );
}
