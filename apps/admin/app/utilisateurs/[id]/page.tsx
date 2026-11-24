'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  formatAdminUserStatus,
  VERIFICATION_LEVEL_LABEL,
  ADMIN_ROLE_LABEL,
  type AdminRole,
  type AdminUserDetail,
} from '@revime/shared';
import { UserSummaryKpis } from '../../../components/UserSummaryKpis';
import { UserDetailTabs, getActivityEntryHref } from '../../../components/UserDetailTabs';
import { UserInternalNotes } from '../../../components/UserInternalNotes';
import { UserActionForms } from '../../../components/UserActionForms';
import { RepairerBlock } from '../../../components/RepairerBlock';
import { UserFiscalBlock } from '../../../components/UserFiscalBlock';
import { ParticularQuotaBlock } from '../../../components/ParticularQuotaBlock';
import { LoginLockBlock } from '../../../components/LoginLockBlock';
import { useAdminMe } from '../../../components/AdminGate';
import { hasPermission } from '../../../lib/permissions';
import { StaffControls } from '../../../components/StaffControls';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { decisionLine } from '../../../lib/identity-decision';
import { isDeletedUser } from '../../../lib/user-display';

export { getActivityEntryHref };

type View =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'loaded'; data: AdminUserDetail };

export default function UtilisateurFichePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [view, setView] = useState<View>({ state: 'loading' });
  const [busy, setBusy] = useState(false);
  const me = useAdminMe();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setView({ state: 'loading' });
    try {
      const r = await fetch(`/api/proxy/admin/users/${id}`);
      if (!r.ok) {
        setView({ state: 'error' });
        return;
      }
      setView({ state: 'loaded', data: (await r.json()) as AdminUserDetail });
    } catch {
      setView({ state: 'error' });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * One handler for every write, because they differ only in path, method, body and
   * confirmation. `confirmText` is null for the reversible ones.
   *
   * 🛑 The success message is set AFTER the reload and rendered outside the detail
   * block. P5's review found both operator pages discarding their own success message,
   * so an irreversible action confirmed nothing and invited the retry.
   */
  async function act(
    path: string,
    method: 'PATCH' | 'DELETE' | 'POST',
    body: unknown,
    successMessage: string,
    confirmText: string | null,
  ) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;
      const r = await fetch(`/api/proxy/${cleanPath}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        // 🛑 CONFLICT on delete means the platform is holding funds. The API's message is
        // second-person ("Vous avez..."), aimed at the account owner. Render a neutral,
        // operator-facing sentence for this specific case, but surface other errors as-is.
        if (r.status === 409 && method === 'DELETE') {
          const apiMsg = data.error?.message;
          if (apiMsg && apiMsg.includes('réparation en cours')) {
            setError(
              'Ce compte ne peut pas être supprimé car une réparation est en cours avec de l\'argent en attente. Terminez la réparation ou émettez un remboursement avant de supprimer le compte.',
            );
          } else {
            setError(apiMsg || 'Ce compte ne peut pas être supprimé en raison d\'un conflit.');
          }
        } else {
          setError(data.error?.message || 'Une erreur est survenue.');
        }
        setBusy(false);
        return;
      }
      await load();
      setSuccess(successMessage);
    } catch {
      setError('Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddNote(content: string) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await fetch(`/api/proxy/admin/users/${id}/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await r.json();
      if (!r.ok) {
        const msg = data.error?.message || 'Impossible d\'ajouter la note interne.';
        setError(msg);
        throw new Error(msg);
      }
      await load();
      setSuccess('Note interne ajoutée avec succès.');
    } catch (err) {
      if (!error) {
        setError(err instanceof Error ? err.message : 'Une erreur est survenue lors de l\'ajout de la note.');
      }
      throw err;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page page--detail">
      <Breadcrumbs
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Utilisateurs', href: '/utilisateurs' },
          {
            label:
              view.state === 'loaded'
                ? view.data.identity?.name || view.data.contact?.email || 'Fiche utilisateur'
                : 'Fiche utilisateur',
          },
        ]}
      />

      <div style={{ marginBottom: '16px' }}>
        <Link
          href="/utilisateurs"
          style={{
            color: 'var(--muted)',
            textDecoration: 'none',
            fontSize: '14px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 500,
          }}
        >
          ← Retour aux utilisateurs
        </Link>
      </div>

      <h1>Fiche utilisateur</h1>

      {view.state === 'loading' && <p>Chargement...</p>}

      {view.state === 'error' && (
        <p role="alert" style={{ color: 'red' }}>
          Impossible de charger cette fiche utilisateur.
        </p>
      )}

      {/* Success and error messages rendered OUTSIDE the view.state === 'loaded' block
          so they survive the reload after an action. */}
      {error && (
        <p role="alert" style={{ color: 'red' }}>
          {error}
        </p>
      )}
      {success && (
        <p role="status" style={{ color: 'green' }}>
          {success}
        </p>
      )}

      {view.state === 'loaded' && (() => {
        const d = view.data;
        return (
          <>
            {/* Horizontal Summary KPI bar across top of fiche */}
            <UserSummaryKpis kpis={d.summaryKpis} />

            <div className="detail-grid">
              {/* Left Column: Information & Activity */}
              <div data-testid="detail-grid-left">
                {/* Ch.8 §8.2's nine fiche fields, in the client's order */}
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                  <h2 style={{ fontSize: '18px', marginBottom: '1rem' }}>Identité</h2>
                  <p>
                    <strong>Nom affiché :</strong> {d.identity.name}
                    {d.marker === 'demo' && ' · démo'}
                    {d.marker === 'fixture' && ' · fixture de test'}
                    {d.marker === 'review' && ' · compte de revue'}
                  </p>
                  <p>
                    <strong>Prénom/Nom :</strong>{' '}
                    {d.identity.firstName && d.identity.lastName
                      ? `${d.identity.firstName} ${d.identity.lastName}`
                      : '-'}
                  </p>
                  <p>
                    <strong>Identifiant public :</strong> {d.identity.username}
                  </p>
                </div>

                <div className="card" style={{ marginBottom: '1.5rem' }}>
                  <h2 style={{ fontSize: '18px', marginBottom: '1rem' }}>Coordonnées</h2>
                  <p>
                    <strong>E-mail :</strong>{' '}
                    {isDeletedUser(d.identity.name, d.contact.email, d.status.kind === 'deleted')
                      ? '— (Compte supprimé)'
                      : `${d.contact.email} ${d.contact.emailVerified ? '(vérifié)' : '(non vérifié)'}`}
                  </p>
                  <p>
                    <strong>Téléphone :</strong>{' '}
                    {isDeletedUser(d.identity.name, d.contact.email, d.status.kind === 'deleted')
                      ? '—'
                      : d.contact.phone || '-'}
                    {!isDeletedUser(d.identity.name, d.contact.email, d.status.kind === 'deleted') &&
                      d.contact.phone &&
                      (d.contact.phoneVerified ? ' (vérifié)' : ' (non vérifié)')}
                  </p>
                </div>

                <div className="card" style={{ marginBottom: '1.5rem' }}>
                  <h2 style={{ fontSize: '18px', marginBottom: '1rem' }}>Compte</h2>
                  <p>
                    <strong>Type de compte :</strong>{' '}
                    {[
                      d.account.clientEnabled ? 'Client' : null,
                      d.account.repairerEnabled ? 'Réparateur' : null,
                    ]
                      .filter(Boolean)
                      .join(' et ') || '-'}
                  </p>
                  <p>
                    <strong>Mode actif :</strong> {d.account.activeMode === 'CLIENT' ? 'Client' : 'Réparateur'}
                  </p>
                  <p>
                    <strong>Rôle :</strong>{' '}
                    {d.account.role ? (ADMIN_ROLE_LABEL[d.account.role as AdminRole] ?? d.account.role) : '-'}
                  </p>
                  <p>
                    <strong>Niveau de vérification :</strong>{' '}
                    {VERIFICATION_LEVEL_LABEL[d.verificationLevel] ?? d.verificationLevel}
                  </p>
                  <p>
                    <strong>Statut :</strong> {formatAdminUserStatus(d.status)}
                    {d.status.kind === 'suspended' && d.status.reason && (
                      <span style={{ display: 'block', marginTop: '0.25rem', color: 'var(--muted)' }}>
                        Motif : {d.status.reason}
                      </span>
                    )}
                  </p>
                  <p>
                    <strong>Inscrit le :</strong> {new Date(d.createdAt).toLocaleDateString('fr-FR')}
                  </p>
                </div>

                {/* Réparateur block */}
                <RepairerBlock id={id} block={d.repairer} status={d.status} busy={busy} act={act} setError={setError} />

                {/* Bloc Informations fiscales */}
                {d.fiscal && (
                  <UserFiscalBlock
                    userId={id}
                    userName={d.identity.name}
                    fiscal={d.fiscal}
                    onRefresh={load}
                  />
                )}

                {/* 7 Structured Tabs (Activité, Commandes, Paiements, Litiges, Avis, Signalements, Connexions) */}
                <UserDetailTabs history={d.history} tabsData={d.tabsData} />
              </div>

              {/* Right Column: Identity Decision, Actions & Staff Controls */}
              <div data-testid="detail-grid-right">
                {/* V7 A11 (U2): login / code lock-out, with the audited unlock */}
                {d.loginLock && (
                  <LoginLockBlock
                    lock={d.loginLock}
                    canUnlock={hasPermission(me, 'users.moderate')}
                    busy={busy}
                    onUnlock={() => {
                      void act(
                        `admin/users/${id}/unlock-login`,
                        'PATCH',
                        {},
                        'Connexion débloquée.',
                        'Débloquer la connexion de ce compte maintenant ?',
                      );
                    }}
                  />
                )}

                {/* Particular Repairer Quota Counter (A-2) */}
                {d.particularQuota && <ParticularQuotaBlock quota={d.particularQuota} />}

                {/* CF4-39 (spec §4.6): the current identity decision, read-only, beside revoke /
                    restore. Decisions are taken from /verifications. */}
                {decisionLine(d.identityDecision) && (
                  <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <p style={{ margin: 0 }}>
                      <strong>Décision d&apos;identité :</strong> {decisionLine(d.identityDecision)}
                    </p>
                  </div>
                )}

                {/* Internal Notes block */}
                <UserInternalNotes
                  userId={id}
                  notes={d.internalNotes ?? []}
                  busy={busy}
                  onAddNote={handleAddNote}
                />

                {/* Actions administratives */}
                <UserActionForms
                  id={id}
                  userEmail={d.contact?.email}
                  userName={d.identity.name}
                  status={d.status}
                  busy={busy}
                  act={act}
                  setError={setError}
                />

                {/* CF4-40 / CF4-41: Super Admin only (StaffControls decides; the API enforces). */}
                <StaffControls
                  id={id}
                  staffRole={d.staffRole}
                  status={d.status}
                  setError={setError}
                  onDone={(message) => {
                    void load().then(() => setSuccess(message));
                  }}
                />
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
