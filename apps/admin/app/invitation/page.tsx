'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ADMIN_ROLE_LABEL, type VerifyStaffInvitationResponse } from '@revime/shared';
import { signIn } from '../../lib/auth-client';

export type InvitationState = 'loading' | 'missing_token' | 'invalid' | 'valid';

export function validatePasswordInput(
  password: string,
  confirmPassword: string,
): { ok: true } | { ok: false; error: string } {
  if (password.length < 8) {
    return { ok: false, error: 'Le mot de passe doit contenir au moins 8 caractères.' };
  }
  if (password !== confirmPassword) {
    return { ok: false, error: 'Les mots de passe ne correspondent pas.' };
  }
  return { ok: true };
}

export function InvitationLoadingView() {
  return (
    <div className="page">
      <p>Vérification de votre invitation...</p>
    </div>
  );
}

export function InvitationErrorView({
  errorMessage,
  onBackToLogin,
}: {
  errorMessage: string | null;
  onBackToLogin?: () => void;
}) {
  return (
    <div className="page">
      <div className="card">
        <h1>Invitation invalide</h1>
        <div role="alert">
          {errorMessage || 'Cette invitation est invalide ou a expiré.'}
        </div>
        <p>
          Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur, veuillez contacter l&apos;administrateur qui vous a invité.
        </p>
        <button type="button" onClick={onBackToLogin}>
          Retour à la connexion
        </button>
      </div>
    </div>
  );
}

export function InvitationValidView({
  invitation,
  firstName,
  lastName,
  password,
  confirmPassword,
  formError,
  submitting,
  onFirstNameChange,
  onLastNameChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
}: {
  invitation: VerifyStaffInvitationResponse;
  firstName: string;
  lastName: string;
  password: string;
  confirmPassword: string;
  formError: string | null;
  submitting: boolean;
  onFirstNameChange: (val: string) => void;
  onLastNameChange: (val: string) => void;
  onPasswordChange: (val: string) => void;
  onConfirmPasswordChange: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div className="page">
      <div className="card">
        <h1>Rejoindre l&apos;équipe REVIME</h1>
        <p>Configurez votre compte collaborateur pour accéder au tableau de bord.</p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            background: 'var(--canvas)',
            borderRadius: 'var(--r-field)',
            marginBottom: '20px',
            border: '1px solid var(--line)',
          }}
        >
          <span style={{ fontSize: '14px', color: 'var(--muted)' }}>Rôle attribué</span>
          <span
            data-testid="role-badge"
            style={{
              background: 'var(--navy-deep)',
              color: 'var(--on-accent, #ffffff)',
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            {ADMIN_ROLE_LABEL[invitation.role] ?? invitation.role}
          </span>
        </div>

        {invitation.isExistingUser && (
          <div className="banner" style={{ marginBottom: '20px' }}>
            <strong>Compte existant :</strong> Vous possédez déjà un compte sur REVIME avec cette adresse e-mail. L&apos;acceptation de cette invitation ajoutera vos privilèges d&apos;administration et mettra à jour votre mot de passe.
          </div>
        )}

        <form onSubmit={onSubmit}>
          <div>
            <label htmlFor="email">Adresse e-mail</label>
            <input
              id="email"
              type="email"
              value={invitation.email}
              disabled
              readOnly
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label htmlFor="firstName">Prénom</label>
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => onFirstNameChange(e.target.value)}
                required
                autoComplete="given-name"
              />
            </div>
            <div>
              <label htmlFor="lastName">Nom</label>
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => onLastNameChange(e.target.value)}
                autoComplete="family-name"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword">Confirmer le mot de passe</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => onConfirmPasswordChange(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          {formError && <div role="alert">{formError}</div>}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Création du compte...' : 'Créer mon compte et continuer'}
          </button>
        </form>
      </div>
    </div>
  );
}

export function InvitationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState<InvitationState>(
    token ? 'loading' : 'missing_token',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(
    token ? null : "Aucun jeton d'invitation n'a été fourni.",
  );
  const [invitation, setInvitation] = useState<VerifyStaffInvitationResponse | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setState('missing_token');
      setErrorMessage("Aucun jeton d'invitation n'a été fourni.");
      return;
    }

    let cancelled = false;

    fetch(`/api/proxy/admin/staff/invitations/public/verify?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setState('invalid');
          setErrorMessage(body?.message || 'Cette invitation est invalide ou a expiré.');
          return;
        }
        const data = (await res.json()) as VerifyStaffInvitationResponse;
        if (cancelled) return;
        setInvitation(data);
        setFirstName(data.firstName ?? '');
        setLastName(data.lastName ?? '');
        setState('valid');
      })
      .catch(() => {
        if (cancelled) return;
        setState('invalid');
        setErrorMessage("Impossible de vérifier l'invitation. Veuillez réessayer.");
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const validation = validatePasswordInput(password, confirmPassword);
    if (!validation.ok) {
      setFormError(validation.error);
      return;
    }

    if (!token) {
      setFormError("Jeton d'invitation manquant.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/proxy/admin/staff/invitations/public/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password,
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setFormError(body?.message || "Une erreur est survenue lors de l'acceptation de l'invitation.");
        setSubmitting(false);
        return;
      }

      const email = invitation?.email;
      if (!email) {
        router.replace('/login');
        return;
      }

      const { error: signInErr } = await signIn.email({ email, password });
      if (signInErr) {
        router.replace('/login');
        return;
      }

      router.replace('/securite');
    } catch {
      setFormError('Une erreur inattendue est survenue.');
      setSubmitting(false);
    }
  }

  if (state === 'loading') {
    return <InvitationLoadingView />;
  }

  if (state === 'missing_token' || state === 'invalid') {
    return (
      <InvitationErrorView
        errorMessage={errorMessage}
        onBackToLogin={() => router.push('/login')}
      />
    );
  }

  if (!invitation) {
    return <InvitationLoadingView />;
  }

  return (
    <InvitationValidView
      invitation={invitation}
      firstName={firstName}
      lastName={lastName}
      password={password}
      confirmPassword={confirmPassword}
      formError={formError}
      submitting={submitting}
      onFirstNameChange={setFirstName}
      onLastNameChange={setLastName}
      onPasswordChange={setPassword}
      onConfirmPasswordChange={setConfirmPassword}
      onSubmit={handleSubmit}
    />
  );
}

export default function InvitationPage() {
  return (
    <Suspense fallback={<InvitationLoadingView />}>
      <InvitationContent />
    </Suspense>
  );
}
