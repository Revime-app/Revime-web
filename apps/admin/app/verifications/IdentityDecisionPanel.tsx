'use client';

import Link from 'next/link';
import { useState } from 'react';
import { identityRefusalReasonFr, type AdminVerificationListItem } from '@revime/shared';
import {
  allowedActions,
  decisionLine,
  validateIdentityAccept,
  stripeIdentitySessionUrl,
} from '../../lib/identity-decision';
import { IdentityDecisionModal, type DecisionKind } from './IdentityDecisionModal';
import { useAdminMe } from '../../components/AdminGate';
import { hasPermission } from '../../lib/permissions';

/**
 * CF4-39 (sub-project M, spec §4.6) & Bug B5 (Client Feedback V6 §9.1.1).
 * The identity row's « Action » panel: Stripe status and reason, fraud signal,
 * direct link to Stripe Identity session, current decision (motif, note, author, date),
 * prominent manual acceptance justification reason, link to user sheet, and decision buttons.
 *
 * Manual acceptance strictly enforces a mandatory justification reason (min 5 chars).
 * REVIME stores no documents: the operator checks them in Stripe. After any decision - or a
 * CONFLICT - the list is reloaded.
 */

const STRIPE_STATUS_LABEL: Record<NonNullable<AdminVerificationListItem['identity']>['stripeStatus'], string> = {
  REQUIRES_INPUT: 'En attente de documents',
  PROCESSING: 'En cours de vérification',
  VERIFIED: 'Vérifiée par Stripe',
  CANCELED: 'Annulée',
};

export interface IdentityDecisionPanelProps {
  row: AdminVerificationListItem;
  onClose: () => void;
  /** Reload the list; called after a decision and after a CONFLICT. */
  onChanged: () => void;
}

const buttonStyle = (tone: 'danger' | 'neutral' | 'ok'): React.CSSProperties => ({
  padding: '8px 14px',
  fontSize: 14,
  fontWeight: 500,
  borderRadius: 4,
  border: tone === 'neutral' ? '1px solid var(--line, #dfe2e2)' : 'none',
  backgroundColor: tone === 'danger' ? 'var(--red-deep, #bd0e26)' : tone === 'ok' ? 'var(--navy)' : 'var(--paper)',
  color: tone === 'neutral' ? 'var(--ink, #141414)' : '#fff',
  cursor: 'pointer',
});

export async function sendIdentityAcceptRequest(
  userId: string,
  note: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true }> {
  const validation = validateIdentityAccept(note);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  const res = await fetchImpl(`/api/proxy/admin/users/${encodeURIComponent(userId)}/identity/accept`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: validation.note }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const message: string = data?.error?.message || "Impossible d'accepter la vérification.";
    const err = new Error(data?.error?.fields?.note || message);
    (err as unknown as { status: number }).status = res.status;
    throw err;
  }
  return { ok: true };
}

export interface IdentityDecisionPanelViewProps {
  row: AdminVerificationListItem;
  canDecide: boolean;
  confirmingAccept: boolean;
  acceptNote: string;
  banner: string | null;
  saving: boolean;
  modal: DecisionKind | null;
  onClose: () => void;
  onChanged: () => void;
  onStartConfirmAccept: () => void;
  onCancelConfirmAccept: () => void;
  onAccept: () => void;
  onSetAcceptNote: (note: string) => void;
  onSetModal: (modal: DecisionKind | null) => void;
  onConflict: (message: string) => void;
}

export function IdentityDecisionPanelView({
  row,
  canDecide,
  confirmingAccept,
  acceptNote,
  banner,
  saving,
  modal,
  onClose,
  onChanged,
  onStartConfirmAccept,
  onCancelConfirmAccept,
  onAccept,
  onSetAcceptNote,
  onSetModal,
  onConflict,
}: IdentityDecisionPanelViewProps) {
  const identity = row.identity;
  const allowed = allowedActions(identity);
  const line = identity ? decisionLine(identity) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="identity-panel-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.35)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ backgroundColor: 'var(--paper)', borderRadius: 10, padding: 24, width: '100%', maxWidth: 560, display: 'grid', gap: 12 }}>
        <h2 id="identity-panel-title" style={{ fontSize: 18, margin: 0 }}>
          Vérification d&apos;identité · {row.displayName}
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted, #6b7280)' }}>
          {row.username} · {row.email}
        </p>

        {banner && (
          <p
            role="alert"
            style={{
              margin: 0,
              color: 'var(--red-text, #bd0e26)',
              backgroundColor: 'var(--red-soft, #feedf0)',
              padding: '10px 14px',
              borderRadius: 4,
              fontSize: 14,
            }}
          >
            {banner}
          </p>
        )}

        {identity === null ? (
          <p style={{ margin: 0, fontSize: 14 }}>Aucune vérification d&apos;identité à décider pour ce compte.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
            <p style={{ margin: 0 }}>
              <strong>Statut Stripe :</strong> {STRIPE_STATUS_LABEL[identity.stripeStatus]}
            </p>
            {identity.lastErrorCode && (
              <p style={{ margin: 0 }}>
                <strong>Motif Stripe :</strong> {identityRefusalReasonFr(identity.lastErrorCode)}
              </p>
            )}
            {identity.fraudSignal && (
              <p style={{ margin: 0, color: 'var(--red-text, #bd0e26)' }}>
                <strong>Signal de fraude :</strong> le selfie n&apos;a pas correspondu au document.
              </p>
            )}
            <p style={{ margin: 0 }}>
              <strong>Décision REVIME :</strong> {line ?? 'Aucune'}
            </p>

            {/* Bug B5: Display justification motif prominently when identity was accepted manually */}
            {identity.decision === 'ACCEPTED' && (
              <div
                data-testid="identity-manual-accept-justification"
                style={{
                  backgroundColor: 'var(--badge-success-bg)',
                  border: '1px solid var(--badge-success-border)',
                  borderRadius: 6,
                  padding: '10px 12px',
                  marginTop: 2,
                }}
              >
                <p style={{ margin: 0, fontSize: 13, color: 'var(--badge-success-text)' }}>
                  <strong>Motif d&apos;acceptation manuelle :</strong>{' '}
                  {identity.note || 'Aucun motif renseigné'}
                </p>
              </div>
            )}

            {/* Bug B5: Direct link to Stripe Identity verification session */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <a
                href={stripeIdentitySessionUrl(identity.stripeSessionId)}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="stripe-identity-session-link"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  color: 'var(--badge-info-text)',
                  fontWeight: 600,
                  textDecoration: 'underline',
                }}
              >
                Consulter la session Stripe Identity{identity.stripeSessionId ? ` (${identity.stripeSessionId})` : ''} ↗
              </a>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted, #6b7280)' }}>
              Consultez les documents originaux dans le tableau de bord Stripe avant de décider.
            </p>
          </div>
        )}

        {confirmingAccept && (
          <div style={{ display: 'grid', gap: 8, padding: 12, border: '1px solid var(--line, #dfe2e2)', borderRadius: 6, backgroundColor: 'var(--badge-neutral-bg)' }}>
            <p style={{ margin: 0, fontSize: 14 }}>
              Accepter cette identité ? Le réparateur sera validé immédiatement.
            </p>
            <label htmlFor="identity-accept-note" style={{ fontSize: 13, fontWeight: 600 }}>
              Motif de justification (obligatoire) *
            </label>
            <textarea
              id="identity-accept-note"
              value={acceptNote}
              onChange={(e) => onSetAcceptNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Justification obligatoire (ex : passeport vérifié manuellement dans Stripe)..."
              style={{ width: '100%', padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', borderRadius: 4, border: '1px solid var(--line, #dfe2e2)' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={onCancelConfirmAccept} style={buttonStyle('neutral')}>
                Annuler
              </button>
              <button type="button" disabled={saving} onClick={onAccept} style={buttonStyle('ok')}>
                {saving ? 'Enregistrement…' : "Confirmer l'acceptation"}
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href={`/utilisateurs/${row.userId}`} style={{ fontSize: 14, color: 'var(--badge-info-text)' }}>
            Voir l&apos;utilisateur
          </Link>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {canDecide && allowed.accept && !confirmingAccept && (
              <button type="button" onClick={onStartConfirmAccept} style={buttonStyle('ok')}>
                Accepter
              </button>
            )}
            {canDecide && allowed.request && (
              <button type="button" onClick={() => onSetModal('request')} style={buttonStyle('neutral')}>
                Demander de nouveaux documents
              </button>
            )}
            {canDecide && allowed.refuse && (
              <button type="button" onClick={() => onSetModal('refuse')} style={buttonStyle('danger')}>
                Refuser
              </button>
            )}
            <button type="button" onClick={onClose} style={buttonStyle('neutral')}>
              Fermer
            </button>
          </div>
        </div>
      </div>

      {modal && (
        <IdentityDecisionModal
          userId={row.userId}
          kind={modal}
          onClose={() => onSetModal(null)}
          onConflict={onConflict}
          onDone={() => {
            onSetModal(null);
            onChanged();
            onClose();
          }}
        />
      )}
    </div>
  );
}

export function IdentityDecisionPanel({ row, onClose, onChanged }: IdentityDecisionPanelProps) {
  const [modal, setModal] = useState<DecisionKind | null>(null);
  const [confirmingAccept, setConfirmingAccept] = useState(false);
  // CF4-40: display only - the API answers 403 to a role without the permission.
  const adminMe = useAdminMe();
  const canDecide = hasPermission(adminMe, 'verification.decide');
  const [acceptNote, setAcceptNote] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function conflict(message: string) {
    setModal(null);
    setConfirmingAccept(false);
    setBanner(message);
    onChanged();
  }

  async function accept() {
    const validation = validateIdentityAccept(acceptNote);
    if (!validation.ok) {
      setBanner(validation.error);
      return;
    }

    setSaving(true);
    setBanner(null);
    try {
      await sendIdentityAcceptRequest(row.userId, acceptNote);
      setConfirmingAccept(false);
      onChanged();
      onClose();
    } catch (err: unknown) {
      const errorObj = err as { status?: number; message?: string };
      if (errorObj?.status === 409) {
        conflict(errorObj.message || 'Conflit de décision.');
        return;
      }
      setBanner(errorObj?.message || "Impossible d'accepter la vérification.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <IdentityDecisionPanelView
      row={row}
      canDecide={canDecide}
      confirmingAccept={confirmingAccept}
      acceptNote={acceptNote}
      banner={banner}
      saving={saving}
      modal={modal}
      onClose={onClose}
      onChanged={onChanged}
      onStartConfirmAccept={() => setConfirmingAccept(true)}
      onCancelConfirmAccept={() => setConfirmingAccept(false)}
      onAccept={() => void accept()}
      onSetAcceptNote={setAcceptNote}
      onSetModal={setModal}
      onConflict={conflict}
    />
  );
}
