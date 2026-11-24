'use client';

import React, { useState, useEffect } from 'react';
import {
  ADMIN_ROLES,
  ADMIN_ROLE_LABEL,
  type AdminRole,
  type StaffMemberItem,
} from '@revime/shared';
import { ADMIN_ROLE_DESCRIPTIONS } from './InviteStaffModal';
import { TriangleAlert } from 'lucide-react';
import { Icon } from '../../components/Icon';

export async function sendEditRoleRequest(
  userId: string,
  role: AdminRole,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/proxy/admin/users/${encodeURIComponent(userId)}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      if (res.status === 409) {
        return {
          ok: false,
          error:
            data?.error?.message ??
            data?.message ??
            'La plateforme doit conserver au moins 2 Super Admins actifs en permanence.',
        };
      }
      return {
        ok: false,
        error:
          data?.error?.message ??
          data?.message ??
          'Impossible de modifier le rôle de ce collaborateur.',
      };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: 'Erreur réseau. Impossible de modifier le rôle.' };
  }
}

export interface EditRoleModalProps {
  member: StaffMemberItem | null;
  onClose: () => void;
  onSuccess: (message?: string) => void;
}

export function EditRoleModal({ member, onClose, onSuccess }: EditRoleModalProps) {
  const [role, setRole] = useState<AdminRole>('support');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (member) {
      setRole(member.role);
      setError(null);
    }
  }, [member]);

  if (!member) return null;

  const memberDisplayName =
    [member.firstName, member.lastName].filter(Boolean).join(' ') ||
    member.name ||
    member.email;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    setError(null);

    setSubmitting(true);
    const result = await sendEditRoleRequest(member.id, role);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onSuccess('Rôle mis à jour. Les sessions du collaborateur ont été fermées.');
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-role-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--paper)',
          borderRadius: '8px',
          padding: '24px',
          width: '100%',
          maxWidth: '520px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        }}
      >
        <h2 id="edit-role-title" style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--ink)' }}>
          Modifier le rôle
        </h2>

        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--canvas)',
            borderRadius: 'var(--r-field)',
            border: '1px solid var(--line)',
            marginBottom: '16px',
          }}
        >
          <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '15px' }}>
            {memberDisplayName}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '2px' }}>
            {member.email}
          </div>
        </div>

        {error && (
          <div role="alert" style={{ marginBottom: '16px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label htmlFor="edit-role-select" style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
              Nouveau rôle
            </label>
            <select
              id="edit-role-select"
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole)}
              disabled={submitting}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '15px',
                border: '1px solid var(--line)',
                borderRadius: 'var(--r-field)',
                background: 'var(--paper)',
                color: 'var(--ink)',
                fontFamily: 'inherit',
              }}
            >
              {ADMIN_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ADMIN_ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '8px 0 0 0', lineHeight: 1.4 }}>
              {ADMIN_ROLE_DESCRIPTIONS[role]}
            </p>
          </div>

          <p
            style={{
              fontSize: '13px',
              color: 'var(--amber-deep)',
              backgroundColor: 'var(--amber-soft)',
              padding: '10px 14px',
              borderRadius: 'var(--r-field)',
              margin: '0',
              lineHeight: 1.4,
            }}
          >
            <Icon as={TriangleAlert} /> La modification du rôle fermera immédiatement toutes les sessions actives de ce collaborateur.
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                background: 'var(--muted)',
                color: 'var(--on-accent, #ffffff)',
                border: 'none',
                padding: '10px 18px',
                borderRadius: 'var(--r-field)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting || role === member.role}
              style={{
                background: 'var(--accent)',
                color: 'var(--on-accent, #ffffff)',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 'var(--r-field)',
                fontWeight: 600,
                cursor: submitting || role === member.role ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
