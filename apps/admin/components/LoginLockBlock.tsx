'use client';

import React from 'react';
import type { AdminLockScope, AdminUserLoginLock } from '@revime/shared';

export interface LoginLockBlockProps {
  lock: AdminUserLoginLock;
  /** `users.moderate`; the API also keeps a staff account's lock to a super admin. */
  canUnlock: boolean;
  busy: boolean;
  onUnlock: () => void;
}

const SCOPE_LABEL: Record<AdminLockScope, string> = {
  LOGIN_ACCOUNT: 'Connexion par mot de passe',
  CODE_ACCOUNT: 'Codes de vérification',
};

const parisDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  const time = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(d);
  return `${date} à ${time}`;
};

function endedLine(entry: AdminUserLoginLock['history'][number]): string {
  if (entry.unlockReason === 'ADMIN') return 'levé par un administrateur';
  if (entry.unlockReason === 'PASSWORD_RESET') return 'levé par une réinitialisation du mot de passe';
  return new Date(entry.lockedUntil).getTime() > Date.now() ? 'en cours' : 'expiré';
}

/**
 * V7 A11 (U2, Q6). The user sheet's « Blocage de connexion »: the locks in force, the last 20 locks
 * and how each ended, and « Débloquer ». Nothing at all for an account that was never locked.
 */
export function LoginLockBlock({ lock, canUnlock, busy, onUnlock }: LoginLockBlockProps) {
  if (lock.active.length === 0 && lock.history.length === 0) return null;

  return (
    <div className="card" data-testid="login-lock-block" style={{ marginBottom: '1.5rem' }}>
      <h2 style={{ fontSize: '18px', margin: '0 0 1rem 0', color: 'var(--navy-text, #25324f)', fontWeight: 600 }}>
        Blocage de connexion
      </h2>

      {lock.active.length === 0 ? (
        <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--ink2)' }}>Aucun blocage en cours.</p>
      ) : (
        lock.active.map((a) => (
          <p
            key={a.scope}
            data-testid="login-lock-active"
            style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--danger, #b42318)', fontWeight: 600 }}
          >
            {`${SCOPE_LABEL[a.scope]} bloquée jusqu’au ${parisDateTime(a.lockedUntil)} (palier ${a.level})`}
          </p>
        ))
      )}

      {canUnlock && lock.active.length > 0 && (
        <button
          type="button"
          data-testid="unlock-login-button"
          onClick={onUnlock}
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
            margin: '4px 0 12px 0',
          }}
        >
          Débloquer
        </button>
      )}

      {lock.history.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '13px', color: 'var(--ink2)' }}>
          {lock.history.map((h) => (
            <li key={h.id} style={{ padding: '6px 0', borderTop: '1px solid var(--line, #dfe2e2)' }}>
              {/* V7 U2b: a « Ce n'est pas moi » is not a lock, so it has no counter, step or end. */}
              {h.kind === 'SECURED'
                ? `${parisDateTime(h.createdAt)} · sécurisé par l’utilisateur (« Ce n’est pas moi »)`
                : `${parisDateTime(h.createdAt)} · ${SCOPE_LABEL[h.scope]} · palier ${h.level} · ${endedLine(h)}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
