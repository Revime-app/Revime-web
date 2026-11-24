'use client';

import { useState } from 'react';
import {
  toApiDateTime,
  VERIFIED_BADGE_LABEL,
  REDACTION_STATUS_LABEL,
  IDENTITY_STATUS_LABEL,
  IDENTITY_VARIANT_LABEL,
  CONNECT_STATUS_LABEL,
  type AdminRepairerBlock,
  type AdminUserStatus,
} from '@revime/shared';
import { useAdminMe } from './AdminGate';
import { hasPermission } from '../lib/permissions';

type RepairerBlockProps = {
  id: string;
  block: AdminRepairerBlock | null;
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

export function RepairerBlock({ id, block, status, busy, act, setError }: RepairerBlockProps) {
  // 🛑 All hooks BEFORE any conditional return. B1's Critical was an early return
  // sitting after useState and before useEffect, which `tsc` passes but violates
  // Rules of Hooks. Task 12 makes a gate see this; until then we are the gate.
  const [revokeReason, setRevokeReason] = useState('');
  // CF4-40: display only - the API refuses these routes to a role without the permission.
  const me = useAdminMe();
  const canDecide = hasPermission(me, 'verification.decide');
  const canModerate = hasPermission(me, 'users.moderate');
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendUntil, setSuspendUntil] = useState('');

  // Handle null block AFTER all hooks
  if (block === null) {
    return null;
  }

  const isDeleted = status.kind === 'deleted';

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <h2 style={{ fontSize: '18px', marginBottom: '1rem' }}>Réparateur</h2>

      <p>
        <strong>Nom affiché :</strong> {block.displayName}
      </p>
      <p>
        <strong>Type :</strong> {block.kind === 'PRO' ? 'Professionnel' : 'Particulier'}
      </p>
      <p>
        <strong>Bio :</strong> {block.bio || '-'}
      </p>
      <p>
        <strong>Code postal :</strong> {block.postalCode || '-'}
      </p>
      <p>
        <strong>Zone de service :</strong> {block.serviceAreaLabel || '-'}
      </p>
      <p>
        <strong>Rayon de service :</strong>{' '}
        {block.serviceRadiusKm !== null ? `${block.serviceRadiusKm} km` : '-'}
      </p>

      {/* Badge public */}
      <p>
        <strong>Badge public :</strong>{' '}
        {!isDeleted && block.publicBadge !== null ? VERIFIED_BADGE_LABEL[block.publicBadge] : 'Aucun'}
        {!isDeleted && block.revocation ? (
          <span style={{ display: 'block', marginTop: '0.25rem', color: 'var(--red-text)' }}>
            Révoqué le {new Date(block.revocation.at).toLocaleDateString('fr-FR')}
            {block.revocation.reason && ` - ${block.revocation.reason}`}
          </span>
        ) : null}
      </p>

      {/* 🛑 Réparateur mode OFF while a suspension stands. Reachable by the TARGET of the
          moderation action: guard 7 refuses only false → true, so he may switch the mode off.
          Rendered because « Réactiver le mode réparateur » below clears the suspension and does
          NOT re-enable the mode - only he can do that - so an operator told nothing here would
          reactivate, find him still missing from the directory, and have no explanation.

          🛑 No `&& block.suspension !== null` here, and its absence is the point: the API returns
          this block only when the mode is ON **or** a suspension is recorded, so mode-off IMPLIES
          suspended. A second test would read as a guard against a state that cannot reach here,
          which is the class of thing this wave removed elsewhere in the same commit. */}
      {!isDeleted && !block.repairerEnabled && (
        <p>
          <strong>Mode réparateur :</strong>{' '}
          <span style={{ color: 'var(--red-text)' }}>
            désactivé sur ce compte - la réactivation ci-dessous lève la suspension mais ne
            réactive pas le mode, que seul le réparateur peut rallumer.
          </span>
        </p>
      )}

      {/* Suspension */}
      {block.suspension ? (
        <p>
          <strong>Suspension :</strong>
          <span style={{ display: 'block', marginTop: '0.25rem', color: 'var(--red-text)' }}>
            Suspendu depuis le {new Date(block.suspension.at).toLocaleDateString('fr-FR')}
            {block.suspension.until && (
              <>
                {' '}
                - Jusqu&apos;au :{' '}
                {new Date(block.suspension.until).toLocaleDateString('fr-FR')}
              </>
            )}
            {block.suspension.reason && (
              <span style={{ display: 'block', marginTop: '0.25rem' }}>
                Motif : {block.suspension.reason}
              </span>
            )}
          </span>
        </p>
      ) : null}

      {/* 🛑 `!== 0`, NOT `> 0`. A ruling deliberately refused a `Math.max(…, 0)` clamp on the
          delta so that a NEGATIVE value - which means ACCEPTABLE_OFFER_WHERE matched more rows
          than LIVE_OFFER_WHERE, i.e. the two predicates have drifted - stays visible as
          something an operator would report. `> 0` hid exactly that, which put the clamp back in
          the UI after it had been refused in the service. */}
      {block.counts.hiddenLiveOffers !== 0 && (
        <p>
          <strong>Offres masquées :</strong>{' '}
          {/* The prose branches with the sign. « N offre(s) masquée(s) par la suspension » is a
              false statement about a negative delta, and telling an operator to report a figure
              while explaining it as a suspension is the kind of message that gets ignored. */}
          {block.counts.hiddenLiveOffers > 0 ? (
            `${block.counts.hiddenLiveOffers} offre(s) masquée(s) par la suspension`
          ) : (
            <span style={{ color: 'var(--red-text)' }}>
              {block.counts.hiddenLiveOffers} - valeur négative, donc les deux prédicats
              d&apos;offres ne concordent plus. Ce n&apos;est pas un effet de la suspension.
              Signalez-le.
            </span>
          )}
        </p>
      )}

      <p>
        <strong>Offres publiées :</strong> {block.counts.liveOffers}
      </p>

      {/* Identity verification (Stripe outcome) */}
      {block.identity !== null && (
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--line)' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '0.5rem' }}>
            Vérification d&apos;identité (résultat Stripe)
          </h3>
          <p style={{ fontSize: '14px', color: 'var(--muted)', marginBottom: '0.75rem' }}>
            Seul le résultat de la vérification est conservé. Le document d&apos;identité n&apos;est
            jamais stocké.
          </p>
          <p>
            <strong>Statut :</strong> {IDENTITY_STATUS_LABEL[block.identity.status] ?? block.identity.status}
          </p>
          {block.identity.verifiedAt && (
            <p>
              <strong>Vérifié le :</strong>{' '}
              {new Date(block.identity.verifiedAt).toLocaleDateString('fr-FR')}
            </p>
          )}
          {block.identity.lastErrorCode && (
            <p>
              <strong>Dernier code d&apos;erreur :</strong> {block.identity.lastErrorCode}
            </p>
          )}
          <p>
            <strong>Variante :</strong> {IDENTITY_VARIANT_LABEL[block.identity.variant] ?? block.identity.variant}
          </p>
          {block.identity.redactionStatus && (
            <p>
              <strong>Statut de suppression :</strong>{' '}
              {REDACTION_STATUS_LABEL[block.identity.redactionStatus] ?? block.identity.redactionStatus}
            </p>
          )}
          {block.identity.erasureRequestedAt && (
            <p>
              <strong>Effacement demandé le :</strong>{' '}
              {new Date(block.identity.erasureRequestedAt).toLocaleDateString('fr-FR')}
            </p>
          )}
          {block.identity.selfieFraudSignalAt && (
            <p style={{ color: 'var(--red-text)' }}>
              <strong>Signal de fraude selfie :</strong>{' '}
              {new Date(block.identity.selfieFraudSignalAt).toLocaleDateString('fr-FR')}
            </p>
          )}
        </div>
      )}

      {/* Business registry (if present) */}
      {block.business !== null && (
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--line)' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '0.5rem' }}>Registre professionnel</h3>
          <p>
            <strong>SIREN :</strong> {block.business.siren}
          </p>
          {block.business.siret && (
            <p>
              <strong>SIRET :</strong> {block.business.siret}
            </p>
          )}
          {block.business.denomination && (
            <p>
              <strong>Dénomination :</strong> {block.business.denomination}
            </p>
          )}
          {block.business.establishmentAddress && (
            <p>
              <strong>Adresse :</strong> {block.business.establishmentAddress}
            </p>
          )}
          <p>
            <strong>État administratif :</strong> {block.business.etatAdministratif}
          </p>
          <p>
            <strong>Vérifié le :</strong>{' '}
            {new Date(block.business.verifiedAt).toLocaleDateString('fr-FR')}
          </p>
        </div>
      )}

      {/* Connect status (read-only) */}
      {block.connectStatus !== null && (
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--line)' }}>
          <p>
            <strong>Statut Stripe Connect :</strong>{' '}
            {CONNECT_STATUS_LABEL[block.connectStatus] ?? block.connectStatus}
          </p>
        </div>
      )}

      {/* Actions */}
      {!isDeleted && (
        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--line)' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '1rem' }}>Actions réparateur</h3>

          {/* Revoke verification - only shown when publicBadge exists */}
          {canDecide && block.publicBadge !== null && (
            <details style={{ marginBottom: '1rem' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Révoquer la vérification</summary>
              <div style={{ marginTop: '0.75rem' }}>
                <label style={{ display: 'block', marginBottom: '0.75rem' }}>
                  Motif (obligatoire) :
                  <input
                    type="text"
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                    style={{ width: '100%', marginTop: '0.25rem' }}
                    disabled={busy}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    act(
                      `admin/users/${id}/verification/revoke`,
                      'PATCH',
                      { reason: revokeReason },
                      'Vérification révoquée.',
                      'Révoquer la vérification de ce réparateur ? Le badge public sera retiré. Cette action est réversible.',
                    );
                  }}
                  disabled={busy || !revokeReason.trim()}
                >
                  Révoquer
                </button>
              </div>
            </details>
          )}

          {/* Restore verification - only shown when revocation exists */}
          {canDecide && block.revocation !== null && (
            <div style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                onClick={() => {
                  act(
                    `admin/users/${id}/verification/restore`,
                    'PATCH',
                    {},
                    'Révocation annulée. Le blocage est levé ; le niveau de vérification n\'est pas rétabli.',
                    null,
                  );
                }}
                disabled={busy}
              >
                Annuler la révocation
              </button>
            </div>
          )}

          {/* Suspend repairer - only shown when not currently suspended */}
          {canModerate && block.suspension === null && (
            <details style={{ marginBottom: '1rem' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Suspendre le mode réparateur</summary>
              <div style={{ marginTop: '0.75rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                  Motif (obligatoire) :
                  <input
                    type="text"
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                    style={{ width: '100%', marginTop: '0.25rem' }}
                    disabled={busy}
                  />
                </label>
                <label style={{ display: 'block', marginBottom: '0.75rem' }}>
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
                    // Explicit pre-submit check: `min` is advisory in some browsers and a
                    // pasted value can bypass it. Use the same French sentence the API uses.
                    if (suspendUntil && new Date(suspendUntil) <= new Date()) {
                      setError('La date de fin de suspension doit être dans le futur.');
                      return;
                    }
                    act(
                      `admin/users/${id}/repairer/suspend`,
                      'PATCH',
                      { reason: suspendReason, until: suspendUntil ? toApiDateTime(suspendUntil) : undefined },
                      'Mode réparateur suspendu. Ses offres sont masquées.',
                      'Suspendre le mode réparateur ? Les offres publiées seront masquées. Cette action est réversible.',
                    );
                  }}
                  disabled={busy || !suspendReason.trim()}
                >
                  Suspendre
                </button>
              </div>
            </details>
          )}

          {/* Reactivate repairer - only shown when suspended */}
          {canModerate && block.suspension !== null && (
            <div style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                onClick={() => {
                  act(
                    `admin/users/${id}/repairer/reactivate`,
                    'PATCH',
                    {},
                    'Mode réparateur réactivé. Ses offres sont à nouveau visibles.',
                    null,
                  );
                }}
                disabled={busy}
              >
                Réactiver le mode réparateur
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
