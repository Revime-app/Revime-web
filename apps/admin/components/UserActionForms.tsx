'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toApiDateTime, type AdminUserStatus } from '@revime/shared';
import { useAdminMe } from './AdminGate';
import { hasPermission } from '../lib/permissions';
import { SendUserEmailModal } from './SendUserEmailModal';
import { DeleteUserDoubleConfirmModal } from './DeleteUserDoubleConfirmModal';
import { UserDeleteZone } from './UserDeleteZone';
import { Key, Mail } from 'lucide-react';
import { Icon } from './Icon';

type UserActionFormsProps = {
  id: string;
  userEmail?: string;
  userName?: string;
  status: AdminUserStatus;
  busy: boolean;
  act: (
    path: string,
    method: 'PATCH' | 'DELETE' | 'POST',
    body: unknown,
    successMessage: string,
    confirmText: string | null,
  ) => Promise<void>;
  setError: (error: string | null) => void;
};

export function UserActionForms({
  id,
  userEmail,
  userName,
  status,
  busy,
  act,
  setError,
}: UserActionFormsProps) {
  const [suspendReason, setSuspendReason] = useState('');
  const me = useAdminMe();
  const canModerate = hasPermission(me, 'users.moderate');
  const canDelete = hasPermission(me, 'users.delete');
  const [suspendUntil, setSuspendUntil] = useState('');
  const [moderateUsername, setModerateUsername] = useState('');
  const [moderateName, setModerateName] = useState('');
  const [moderateRemoveAvatar, setModerateRemoveAvatar] = useState(false);

  // Modals state
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const isDeleted = status.kind === 'deleted';

  return (
    <div className="card" data-testid="user-action-forms" style={{ marginBottom: '1.5rem' }}>
      <h2 style={{ fontSize: '18px', marginBottom: '1rem', color: 'var(--navy-text, #25324f)' }}>Actions</h2>

      {/* Reactivate (Prominent button for suspended accounts) */}
      {canModerate && status.kind === 'suspended' && (
        <div style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            data-testid="reactivate-user-button"
            onClick={() => {
              void act(`admin/users/${id}/reactivate`, 'PATCH', {}, 'Compte réactivé.', null);
            }}
            disabled={busy}
            style={{
              backgroundColor: 'var(--navy, #25324f)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              width: '100%',
              textAlign: 'center',
            }}
          >
            Réactiver le compte
          </button>
        </div>
      )}

      {/* Send Email Action */}
      {canModerate && !isDeleted && (
        <div style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            data-testid="open-send-email-modal"
            onClick={() => setEmailModalOpen(true)}
            disabled={busy}
            style={{
              backgroundColor: 'var(--paper)',
              color: 'var(--navy-text, #25324f)',
              border: '1px solid var(--navy, #25324f)',
              borderRadius: '8px',
              padding: '9px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Icon as={Mail} /> Envoyer un e-mail
          </button>
        </div>
      )}

      {/* Reset Password Action */}
      {canModerate && !isDeleted && (
        <div style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            data-testid="reset-password-button"
            onClick={() => {
              void act(
                `admin/users/${id}/reset-password`,
                'POST',
                {},
                'E-mail de réinitialisation de mot de passe envoyé.',
                'Envoyer un e-mail de réinitialisation de mot de passe à cet utilisateur ?',
              );
            }}
            disabled={busy}
            style={{
              backgroundColor: 'var(--paper)',
              color: 'var(--ink, #141414)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: '8px',
              padding: '9px 16px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: busy ? 'not-allowed' : 'pointer',
              width: '100%',
              textAlign: 'center',
            }}
          >
            <Icon as={Key} /> Réinitialiser le mot de passe
          </button>
        </div>
      )}

      {/* Suspend */}
      {canModerate && status.kind === 'active' && (
        <details style={{ marginBottom: '1rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '13px', color: 'var(--navy-text, #25324f)' }}>
            Suspendre le compte
          </summary>
          <div style={{ marginTop: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '13px' }}>
              Motif (obligatoire) :
              <input
                type="text"
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                style={{ width: '100%', marginTop: '0.25rem' }}
                disabled={busy}
              />
            </label>
            <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '13px' }}>
              Jusqu&apos;au (optionnel) :
              <input
                type="datetime-local"
                value={suspendUntil}
                onChange={(e) => setSuspendUntil(e.target.value)}
                min={(() => {
                  const now = new Date();
                  const minLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
                    .toISOString()
                    .slice(0, 16);
                  return minLocal;
                })()}
                style={{ width: '100%', marginTop: '0.25rem' }}
                disabled={busy}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                if (suspendUntil && new Date(suspendUntil) <= new Date()) {
                  setError('La date de fin de suspension doit être dans le futur.');
                  return;
                }
                void act(
                  `admin/users/${id}/suspend`,
                  'PATCH',
                  { reason: suspendReason, until: suspendUntil ? toApiDateTime(suspendUntil) : undefined },
                  'Compte suspendu. Ses sessions ont été fermées.',
                  'Suspendre ce compte ? Toutes les sessions ouvertes seront fermées. Cette action est réversible.',
                );
              }}
              disabled={busy || !suspendReason.trim()}
              style={{
                backgroundColor: 'var(--navy, #25324f)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: busy || !suspendReason.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              Suspendre
            </button>
          </div>
        </details>
      )}

      {/* Moderate */}
      {canModerate && !isDeleted && (
        <details style={{ marginBottom: '1rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '13px', color: 'var(--navy-text, #25324f)' }}>
            Modérer le contenu
          </summary>
          <div style={{ marginTop: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '13px' }}>
              Nouvel identifiant public :
              <input
                type="text"
                value={moderateUsername}
                onChange={(e) => setModerateUsername(e.target.value)}
                style={{ width: '100%', marginTop: '0.25rem' }}
                disabled={busy}
              />
            </label>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '13px' }}>
              Nouveau nom affiché :
              <input
                type="text"
                value={moderateName}
                onChange={(e) => setModerateName(e.target.value)}
                style={{ width: '100%', marginTop: '0.25rem' }}
                disabled={busy}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', marginBottom: '0.75rem', fontSize: '13px' }}>
              <input
                type="checkbox"
                checked={moderateRemoveAvatar}
                onChange={(e) => setModerateRemoveAvatar(e.target.checked)}
                disabled={busy}
                style={{ width: 'auto', marginRight: '0.5rem' }}
              />
              Supprimer l&apos;avatar
            </label>
            <button
              type="button"
              onClick={() => {
                const trimmedUsername = moderateUsername.trim();
                const trimmedName = moderateName.trim();
                const body: Record<string, unknown> = {};
                if (trimmedUsername) body.username = trimmedUsername;
                if (trimmedName) body.name = trimmedName;
                if (moderateRemoveAvatar) body.removeAvatar = true;

                void act(`admin/users/${id}/moderate`, 'PATCH', body, 'Contenu modéré.', null);
              }}
              disabled={busy || (!moderateUsername.trim() && !moderateName.trim() && !moderateRemoveAvatar)}
              style={{
                backgroundColor: 'var(--navy, #25324f)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: 600,
                cursor:
                  busy || (!moderateUsername.trim() && !moderateName.trim() && !moderateRemoveAvatar)
                    ? 'not-allowed'
                    : 'pointer',
              }}
            >
              Modérer
            </button>
          </div>
        </details>
      )}

      {/* Delete (with Double Confirmation Modal) */}
      {canDelete && !isDeleted && (
        <UserDeleteZone busy={busy} onOpen={() => setDeleteModalOpen(true)} />
      )}

      <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--line)' }}>
        <Link href="/utilisateurs" style={{ color: 'var(--navy-text, #25324f)', fontSize: '13px', textDecoration: 'none' }}>
          ← Retour à la liste
        </Link>
      </div>

      {/* Modals */}
      <SendUserEmailModal
        isOpen={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        userEmail={userEmail ?? ''}
        userName={userName}
        busy={busy}
        onSend={async ({ subject, message }) => {
          await act(
            `admin/users/${id}/email`,
            'POST',
            { subject, message },
            'E-mail envoyé avec succès à l’utilisateur.',
            null,
          );
        }}
      />

      <DeleteUserDoubleConfirmModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        userName={userName ?? ''}
        userEmail={userEmail ?? ''}
        busy={busy}
        onConfirm={async (reason) => {
          await act(
            `admin/users/${id}`,
            'DELETE',
            { reason },
            'Compte supprimé et données personnelles effacées.',
            null,
          );
        }}
      />
    </div>
  );
}
