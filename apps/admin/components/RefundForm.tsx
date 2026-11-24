'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { REFUND_MOTIF_LABEL, type RefundMotif } from '@revime/shared';
import { RefundConfirmModal } from './RefundConfirmModal';
import {
  buildRefundBody,
  centsToInputValue,
  formatEuros,
  parseEuros,
  refundSummary,
  type RefundBodySnapshot,
} from '../lib/refund-form';

/**
 * CF4-D task 7 (spec §5). Shared by the Remboursement page (mode="commande") and
 * the dispute `ArbitrationModal` (mode="dispute"). The two differ only in the
 * motif field (dispute defaults to `DISPUTE_DECISION` and hides the empty option)
 * and the body shape handed to `onSubmit` (dispute's `note` becomes
 * `resolutionNote` upstream, in the caller - this component always calls back
 * with `{ motif, note, repairCents, shippingCents, protectionCents }` so its own
 * logic does not need to know either endpoint's wire shape).
 */

export interface RefundFormOrder {
  repairCents: number;
  shippingCents: number;
  insuranceCents: number;
  protectionCents: number;
  transferred: boolean;
}

export interface RefundFormSuggestion {
  repairCents: number;
  shippingCents: number;
  protectionCents: number;
}

export interface RefundFormSummary {
  order: RefundFormOrder;
  suggestion: RefundFormSuggestion;
}

export interface RefundFormSubmitBody {
  motif: RefundMotif;
  note: string;
  repairCents: number;
  shippingCents: number;
  protectionCents: number;
}

export interface RefundFormProps {
  summary: RefundFormSummary;
  mode: 'commande' | 'dispute';
  onSubmit: (body: RefundFormSubmitBody) => Promise<void>;
  /**
   * CF4-27 (spec §4.5). Preselected and NOT editable - the « Annulation client » motif is a
   * fact about which caller opened this form, not a choice the admin makes here. Renders the
   * select `disabled` with only that one option, same shape as the note/inputs during
   * `confirming` below.
   */
  fixedMotif?: RefundMotif;
  /**
   * CF5-22: 'full' pre-fills 100% of all lines (Remboursement intégral);
   * 'suggestion' (default) pre-fills step suggestion (Remboursement partiel).
   */
  initialPreset?: 'full' | 'suggestion';
  commandeId?: string;
  clientName?: string;
  repairerName?: string;
}

const MOTIF_ORDER: RefundMotif[] = [
  'CLIENT_CANCELLED',
  'REPAIRER_CANCELLED',
  'REPAIR_NOT_DONE',
  'REPAIR_NONCONFORMING',
  'PARCEL_LOST_OR_DAMAGED',
  'DISPUTE_DECISION',
  'OTHER',
];

type FieldErrors = {
  motif?: string;
  note?: string;
  repair?: string;
  shipping?: string;
  protection?: string;
};

export function RefundForm({
  summary,
  mode,
  onSubmit,
  fixedMotif,
  initialPreset = 'suggestion',
  commandeId,
  clientName,
  repairerName,
}: RefundFormProps) {
  const { order, suggestion } = summary;
  const shippingCeilingCents = order.shippingCents + order.insuranceCents;

  const defaultRepairCents = initialPreset === 'full' ? order.repairCents : suggestion.repairCents;
  const defaultShippingCents = initialPreset === 'full' ? shippingCeilingCents : suggestion.shippingCents;
  const defaultProtectionCents = initialPreset === 'full' ? order.protectionCents : suggestion.protectionCents;

  const [motif, setMotif] = useState<RefundMotif | ''>(
    fixedMotif ?? (mode === 'dispute' ? 'DISPUTE_DECISION' : ''),
  );
  const [note, setNote] = useState('');
  const [repairInput, setRepairInput] = useState(centsToInputValue(defaultRepairCents));
  const [shippingInput, setShippingInput] = useState(centsToInputValue(defaultShippingCents));
  const [protectionInput, setProtectionInput] = useState(centsToInputValue(defaultProtectionCents));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // The frozen body from the review step. Non-null exactly while `confirming` is
  // true - it is what the confirmation line displays and what Confirmer posts,
  // so an edit made after review (which clears this via the onChange handlers
  // below) can never reach the server without going through validation again.
  const [snapshot, setSnapshot] = useState<RefundBodySnapshot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous in-flight guard: React state (`submitting`) only takes effect on
  // the next render, so two `onClick` invocations fired in the same event-loop
  // turn (a fast double-click) both read `submitting === false` before either
  // `setSubmitting(true)` lands, and both would call `onSubmit` - a real double
  // POST on a money-moving endpoint. A ref is mutated immediately, closing that
  // window; `disabled` still exists for the render-visible follow-up clicks.
  const inFlightRef = useRef(false);
  const confirming = snapshot !== null;

  // Re-seed the pre-filled amounts when the underlying order changes (e.g. the
  // Remboursement page re-fetches a different commande, or the dispute modal is
  // opened for a different dossier). Without this the second commande's form
  // would still show the first one's suggestion.
  useEffect(() => {
    const nextRepair = initialPreset === 'full' ? order.repairCents : suggestion.repairCents;
    const nextShipping = initialPreset === 'full' ? shippingCeilingCents : suggestion.shippingCents;
    const nextProtection = initialPreset === 'full' ? order.protectionCents : suggestion.protectionCents;
    setRepairInput(centsToInputValue(nextRepair));
    setShippingInput(centsToInputValue(nextShipping));
    setProtectionInput(centsToInputValue(nextProtection));
    setMotif(fixedMotif ?? (mode === 'dispute' ? 'DISPUTE_DECISION' : ''));
    setNote('');
    setFieldErrors({});
    setSnapshot(null);
    setError(null);
  }, [order.repairCents, order.shippingCents, order.insuranceCents, order.protectionCents, suggestion.repairCents, suggestion.shippingCents, suggestion.protectionCents, mode, initialPreset]);

  const parsedRepair = parseEuros(repairInput);
  const parsedShipping = parseEuros(shippingInput);
  const parsedProtection = parseEuros(protectionInput);

  const summaryLines = useMemo(() => {
    if (parsedRepair === null || parsedShipping === null || parsedProtection === null) return null;
    return refundSummary(
      { repairCents: parsedRepair, shippingCents: parsedShipping, protectionCents: parsedProtection },
      order,
    );
  }, [parsedRepair, parsedShipping, parsedProtection, order]);

  // The confirmation line and Confirmer both read from `snapshot`, not from the
  // live inputs, once confirming - this is what "freeze what is confirmed" means.
  const snapshotSummaryLines = useMemo(() => {
    if (!snapshot) return null;
    return refundSummary(
      { repairCents: snapshot.repairCents, shippingCents: snapshot.shippingCents, protectionCents: snapshot.protectionCents },
      order,
    );
  }, [snapshot, order]);

  function setAllToFull() {
    setRepairInput(centsToInputValue(order.repairCents));
    setShippingInput(centsToInputValue(order.shippingCents + order.insuranceCents));
    setProtectionInput(centsToInputValue(order.protectionCents));
    setFieldErrors({});
    setSnapshot(null);
  }

  function resetToSuggestion() {
    setRepairInput(centsToInputValue(suggestion.repairCents));
    setShippingInput(centsToInputValue(suggestion.shippingCents));
    setProtectionInput(centsToInputValue(suggestion.protectionCents));
    setFieldErrors({});
    setSnapshot(null);
  }

  // Any change to a field that fed the frozen snapshot discards it and returns to
  // editing - otherwise the operator could tweak an amount while "Confirmer" is
  // still showing the old one and click it without a fresh review pass.
  function withDiscardSnapshot<T extends (...args: never[]) => void>(setter: T): T {
    return ((...args: Parameters<T>) => {
      setSnapshot(null);
      setter(...args);
    }) as T;
  }
  const handleMotifChange = withDiscardSnapshot((value: RefundMotif) => setMotif(value));
  const handleNoteChange = withDiscardSnapshot((value: string) => setNote(value));
  const handleRepairChange = withDiscardSnapshot((value: string) => setRepairInput(value));
  const handleShippingChange = withDiscardSnapshot((value: string) => setShippingInput(value));
  const handleProtectionChange = withDiscardSnapshot((value: string) => setProtectionInput(value));

  function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlightRef.current) return;
    setError(null);
    const result = buildRefundBody(
      { motif, note, repairInput, shippingInput, protectionInput },
      order,
    );
    if (!result.ok) {
      setFieldErrors(result.errors);
      setSnapshot(null);
      return;
    }
    setFieldErrors({});
    // Snapshot the parsed body now - this, not the live inputs, is what the
    // confirmation line shows and what Confirmer posts.
    setSnapshot(result.body);
  }

  async function handleConfirm() {
    if (inFlightRef.current || !snapshot) return;
    inFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(snapshot);
      setSnapshot(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
      setSnapshot(null);
      return;
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  }

  function handleCancelConfirm() {
    if (submitting) return;
    setSnapshot(null);
  }

  const totalClientCents = snapshot
    ? snapshot.repairCents + snapshot.shippingCents + snapshot.protectionCents
    : 0;
  // Locked once confirming, in addition to while a request is actually in
  // flight: the brief calls for freezing what is confirmed, so the inputs and
  // helper buttons stay disabled through the whole confirmation step, not just
  // during the POST itself.
  const disabled = submitting || confirming;

  return (
    <form onSubmit={handleReviewSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {error && (
        <p role="alert" style={{ color: 'red' }}>
          {error}
        </p>
      )}

      <div>
        <label htmlFor="refund-motif">Motif du remboursement</label>
        <select
          id="refund-motif"
          value={motif}
          onChange={(e) => handleMotifChange(e.target.value as RefundMotif)}
          disabled={disabled || fixedMotif !== undefined}
          required={mode === 'commande'}
          style={{ display: 'block', width: '100%' }}
        >
          {mode === 'commande' && fixedMotif === undefined && <option value="">— Sélectionner —</option>}
          {(fixedMotif !== undefined ? [fixedMotif] : MOTIF_ORDER).map((m) => (
            <option key={m} value={m}>
              {REFUND_MOTIF_LABEL[m]}
            </option>
          ))}
        </select>
        {fieldErrors.motif && (
          <p role="alert" style={{ color: 'red', fontSize: '0.85rem' }}>
            {fieldErrors.motif}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="refund-note">
          {mode === 'dispute' ? 'Justification de la décision' : 'Note explicative'}
        </label>
        <textarea
          id="refund-note"
          value={note}
          onChange={(e) => handleNoteChange(e.target.value)}
          disabled={disabled}
          required
          rows={3}
          style={{ width: '100%' }}
        />
        {fieldErrors.note && (
          <p role="alert" style={{ color: 'red', fontSize: '0.85rem' }}>
            {fieldErrors.note}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="refund-repair">
          Réparation <span style={{ color: 'var(--muted)', fontWeight: 400 }}>« sur {formatEuros(order.repairCents)} »</span>
        </label>
        <input
          id="refund-repair"
          type="text"
          inputMode="decimal"
          value={repairInput}
          onChange={(e) => handleRepairChange(e.target.value)}
          disabled={disabled}
          required
        />
        {fieldErrors.repair && (
          <p role="alert" style={{ color: 'red', fontSize: '0.85rem' }}>
            {fieldErrors.repair}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="refund-shipping">
          Livraison{' '}
          <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
            « sur {formatEuros(shippingCeilingCents)}
            {order.insuranceCents > 0 ? ` dont assurance ${formatEuros(order.insuranceCents)}` : ''} »
          </span>
        </label>
        <input
          id="refund-shipping"
          type="text"
          inputMode="decimal"
          value={shippingInput}
          onChange={(e) => handleShippingChange(e.target.value)}
          disabled={disabled}
          required
        />
        {fieldErrors.shipping && (
          <p role="alert" style={{ color: 'red', fontSize: '0.85rem' }}>
            {fieldErrors.shipping}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="refund-protection">
          Commission{' '}
          <span style={{ color: 'var(--muted)', fontWeight: 400 }}>« sur {formatEuros(order.protectionCents)} »</span>
        </label>
        <input
          id="refund-protection"
          type="text"
          inputMode="decimal"
          value={protectionInput}
          onChange={(e) => handleProtectionChange(e.target.value)}
          disabled={disabled}
          required
        />
        {fieldErrors.protection && (
          <p role="alert" style={{ color: 'red', fontSize: '0.85rem' }}>
            {fieldErrors.protection}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button type="button" onClick={setAllToFull} disabled={disabled}>
          Tout rembourser
        </button>
        <button type="button" onClick={resetToSuggestion} disabled={disabled}>
          Revenir à la suggestion
        </button>
      </div>

      {(confirming ? snapshotSummaryLines : summaryLines) && (
        <div role="status" style={{ padding: '0.75rem', border: '1px solid var(--line)', borderRadius: '4px' }}>
          {(() => {
            const lines = confirming ? snapshotSummaryLines! : summaryLines!;
            const repairCentsForNote = confirming ? snapshot!.repairCents : parsedRepair;
            return (
              <>
                <p>Remboursé au client : {formatEuros(lines.clientCents)}</p>
                <p>
                  Réparateur : {formatEuros(lines.repairerCents)} {lines.repairerVerb}
                </p>
                <p>Conservé par REVIME : {formatEuros(lines.revimeKeepsCents)}</p>
                {!order.transferred && repairCentsForNote !== null && repairCentsForNote < order.repairCents && (
                  <p>Stripe vérifiera que le réparateur peut recevoir un virement.</p>
                )}
              </>
            );
          })()}
        </div>
      )}

      <button type="submit" disabled={disabled}>
        Rembourser
      </button>

      <RefundConfirmModal
        isOpen={confirming}
        onClose={handleCancelConfirm}
        onConfirm={handleConfirm}
        submitting={submitting}
        commandeId={commandeId}
        clientName={clientName}
        repairerName={repairerName}
        breakdown={{
          repairCents: snapshot?.repairCents ?? 0,
          shippingCents: snapshot?.shippingCents ?? 0,
          protectionCents: snapshot?.protectionCents ?? 0,
        }}
        totalClientCents={totalClientCents}
      />
    </form>
  );
}
