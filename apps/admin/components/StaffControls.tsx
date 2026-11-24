'use client';

import { useState } from 'react';
import { ADMIN_ROLES, ADMIN_ROLE_LABEL, type AdminRole, type AdminUserStatus } from '@revime/shared';
import { useAdminMe } from './AdminGate';
import { useSession } from '../lib/auth-client';
import { staffControlsVisible } from '../lib/permissions';

/**
 * CF4-40 / CF4-41 (spec §4.4). Super Admin only, never on one's own fiche. The API enforces
 * both (`admin.manage`, own-account refusal); this only decides what to show. A deleted
 * account has no team role left to change (B13), so it shows nothing for one.
 */
export function StaffControls({
  id,
  staffRole,
  status,
  onDone,
  setError,
}: {
  id: string;
  staffRole: AdminRole | null;
  status: AdminUserStatus;
  onDone: (message: string) => void;
  setError: (error: string | null) => void;
}) {
  const me = useAdminMe();
  const { data: session } = useSession();
  const [role, setRole] = useState<string>(staffRole ?? '');
  const [busy, setBusy] = useState(false);

  if (status.kind === 'deleted' || !session || !staffControlsVisible(me, id, session.user.id)) return null;

  async function send(path: string, method: 'PATCH' | 'POST', body: unknown, ok: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/proxy/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(data?.error?.message ?? 'Action impossible.');
        return;
      }
      onDone(ok);
    } catch {
      setError('Le serveur ne répond pas. Réessayez.');
    } finally {
      setBusy(false);
    }
  }

  function saveRole() {
    const next = role === '' ? null : (role as AdminRole);
    const label = next ? ADMIN_ROLE_LABEL[next] : 'Aucun';
    if (!window.confirm(`Attribuer le rôle « ${label} » ? Les sessions de ce compte seront fermées.`)) return;
    void send(`admin/users/${id}/role`, 'PATCH', { role: next }, 'Rôle mis à jour. Ses sessions ont été fermées.');
  }

  function resetTwoFactor() {
    if (!window.confirm('Réinitialiser la double authentification ? Ce compte devra la configurer à nouveau.')) return;
    void send(
      `admin/users/${id}/two-factor/reset`,
      'POST',
      {},
      'Double authentification réinitialisée. Ses sessions ont été fermées.',
    );
  }

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ fontSize: '16px', marginBottom: '1rem' }}>Équipe</h3>
      <label htmlFor="staff-role" style={{ display: 'block', marginBottom: '0.5rem' }}>
        Rôle dans l&apos;équipe
      </label>
      <select id="staff-role" value={role} onChange={(e) => setRole(e.target.value)} disabled={busy}>
        <option value="">Aucun</option>
        {ADMIN_ROLES.map((r) => (
          <option key={r} value={r}>
            {ADMIN_ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      <button type="button" onClick={saveRole} disabled={busy || role === (staffRole ?? '')}>
        Enregistrer le rôle
      </button>
      {staffRole && (
        <div style={{ marginTop: '1rem' }}>
          <button type="button" onClick={resetTwoFactor} disabled={busy}>
            Réinitialiser la double authentification
          </button>
        </div>
      )}
    </div>
  );
}
