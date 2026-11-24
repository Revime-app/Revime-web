'use client';

import React, { useState } from 'react';
import {
  ADMIN_ROLES,
  ADMIN_ROLE_LABEL,
  inviteStaffInputSchema,
  type AdminRole,
  type InviteStaffInput,
} from '@revime/shared';

export const ADMIN_ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  super_admin: 'Accès complet à la plateforme et à la gestion de l’équipe',
  admin: 'Accès complet aux opérations (hors gestion de l’équipe)',
  moderation: 'Modération des utilisateurs, contenus, signalements et messages',
  support: 'Support utilisateurs, vérifications d’identité et gestion des litiges',
  finance: 'Gestion financière, arbitrage et émission des remboursements',
  read_only: 'Consultation du tableau de bord en lecture seule',
};

export function validateInviteInput(
  email: string,
  role: string,
  firstName?: string,
  lastName?: string,
): { ok: true; data: InviteStaffInput } | { ok: false; error: string } {
  const parsed = inviteStaffInputSchema.safeParse({
    email: email.trim().toLowerCase(),
    role,
    firstName: firstName?.trim() || undefined,
    lastName: lastName?.trim() || undefined,
  });

  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Veuillez vérifier les informations saisies.';
    return { ok: false, error: msg };
  }

  return { ok: true, data: parsed.data };
}

export async function sendInviteRequest(input: {
  email: string;
  role: AdminRole;
  firstName?: string;
  lastName?: string;
}): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/proxy/admin/staff/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: input.email.trim().toLowerCase(),
        role: input.role,
        firstName: input.firstName?.trim() || undefined,
        lastName: input.lastName?.trim() || undefined,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      if (res.status === 409) {
        return {
          ok: false,
          error:
            data?.error?.message ??
            data?.message ??
            'Cet utilisateur fait déjà partie de l’équipe.',
        };
      }
      return {
        ok: false,
        error:
          data?.error?.message ??
          data?.message ??
          'Impossible d’envoyer l’invitation.',
      };
    }

    return { ok: true, id: data?.id };
  } catch {
    return { ok: false, error: 'Erreur réseau. Impossible d’envoyer l’invitation.' };
  }
}

export interface InviteStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message?: string) => void;
}

export function InviteStaffModal({ isOpen, onClose, onSuccess }: InviteStaffModalProps) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<AdminRole>('support');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validation = validateInviteInput(email, role, firstName, lastName);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setSubmitting(true);
    const result = await sendInviteRequest(validation.data);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onSuccess('Invitation envoyée avec succès.');
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-staff-title"
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
        <h2 id="invite-staff-title" style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--ink)' }}>
          Inviter un collaborateur
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--muted)', margin: '0 0 20px 0' }}>
          Un e-mail contenant un lien d’activation sécurisé sera envoyé à cette adresse.
        </p>

        {error && (
          <div role="alert" style={{ marginBottom: '16px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label htmlFor="invite-email" style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
              E-mail <span style={{ color: 'var(--red-text)' }}>*</span>
            </label>
            <input
              id="invite-email"
              type="email"
              required
              placeholder="collaborateur@revime.fr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label htmlFor="invite-firstname" style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
                Prénom
              </label>
              <input
                id="invite-firstname"
                type="text"
                placeholder="Jean"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div>
              <label htmlFor="invite-lastname" style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
                Nom
              </label>
              <input
                id="invite-lastname"
                type="text"
                placeholder="Dupont"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div>
            <label htmlFor="invite-role" style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
              Rôle <span style={{ color: 'var(--red-text)' }}>*</span>
            </label>
            <select
              id="invite-role"
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
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
              disabled={submitting}
              style={{
                background: 'var(--accent)',
                color: 'var(--on-accent, #ffffff)',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 'var(--r-field)',
                fontWeight: 600,
                cursor: submitting ? 'wait' : 'pointer',
              }}
            >
              {submitting ? 'Envoi en cours...' : 'Envoyer l’invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
