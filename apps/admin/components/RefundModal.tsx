'use client';

import React, { useEffect, useState } from 'react';
import {
  REFUND_MOTIF_LABEL,
  type AdminCommandeDetail,
  type RefundMotif,
} from '@revime/shared';
import { CopyableReference } from './CopyableReference';
import { formatEuros } from '../lib/money';
import { TriangleAlert } from 'lucide-react';
import { Icon } from './Icon';

export interface RefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  commande: AdminCommandeDetail;
  onRefundSubmit?: (body: {
    motif: RefundMotif;
    note: string;
    repairCents: number;
    shippingCents: number;
    protectionCents: number;
  }) => Promise<void>;
}

const MOTIF_LIST: RefundMotif[] = [
  'CLIENT_CANCELLED',
  'REPAIRER_CANCELLED',
  'REPAIR_NOT_DONE',
  'REPAIR_NONCONFORMING',
  'PARCEL_LOST_OR_DAMAGED',
  'DISPUTE_DECISION',
  'OTHER',
];

export function RefundModal({
  isOpen,
  onClose,
  onSuccess,
  commande,
  onRefundSubmit,
}: RefundModalProps) {
  const suggested = commande.amounts.suggestedRefund ?? {
    repairCents: commande.amounts.repairCents,
    shippingCents: commande.amounts.shippingCents,
    protectionCents: commande.amounts.protectionCents,
  };

  const [repairCents, setRepairCents] = useState<number>(suggested.repairCents);
  const [shippingCents, setShippingCents] = useState<number>(suggested.shippingCents);
  const [protectionCents, setProtectionCents] = useState<number>(suggested.protectionCents);
  const [motif, setMotif] = useState<RefundMotif | ''>('');
  const [note, setNote] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const s = commande.amounts.suggestedRefund ?? {
        repairCents: commande.amounts.repairCents,
        shippingCents: commande.amounts.shippingCents,
        protectionCents: commande.amounts.protectionCents,
      };
      setRepairCents(s.repairCents);
      setShippingCents(s.shippingCents);
      setProtectionCents(s.protectionCents);
      setMotif('');
      setNote('');
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen, commande]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

  const totalCents = Math.max(0, repairCents) + Math.max(0, shippingCents) + Math.max(0, protectionCents);

  const handleSetFull = () => {
    setRepairCents(commande.amounts.repairCents);
    setShippingCents(commande.amounts.shippingCents);
    setProtectionCents(commande.amounts.protectionCents);
  };

  const handleResetSuggested = () => {
    const s = commande.amounts.suggestedRefund ?? {
      repairCents: commande.amounts.repairCents,
      shippingCents: commande.amounts.shippingCents,
      protectionCents: commande.amounts.protectionCents,
    };
    setRepairCents(s.repairCents);
    setShippingCents(s.shippingCents);
    setProtectionCents(s.protectionCents);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!motif) {
      setError('Veuillez sélectionner un motif de remboursement.');
      return;
    }
    const trimmedNote = note.trim();
    if (trimmedNote.length < 3) {
      setError('La note explicative doit comporter au moins 3 caractères.');
      return;
    }
    if (repairCents < 0 || shippingCents < 0 || protectionCents < 0) {
      setError('Les montants à rembourser ne peuvent pas être négatifs.');
      return;
    }
    if (repairCents > commande.amounts.repairCents) {
      setError(`Le montant de la réparation ne peut pas dépasser ${formatEuros(commande.amounts.repairCents)}.`);
      return;
    }
    if (shippingCents > commande.amounts.shippingCents) {
      setError(`Les frais de livraison ne peuvent pas dépasser ${formatEuros(commande.amounts.shippingCents)}.`);
      return;
    }
    if (protectionCents > commande.amounts.protectionCents) {
      setError(`La commission ne peut pas dépasser ${formatEuros(commande.amounts.protectionCents)}.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    const body = {
      motif: motif as RefundMotif,
      note: trimmedNote,
      repairCents,
      shippingCents,
      protectionCents,
    };

    try {
      if (onRefundSubmit) {
        await onRefundSubmit(body);
      } else {
        const res = await fetch(`/api/proxy/admin/commandes/${encodeURIComponent(commande.commandeId)}/refund`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          setError(errData?.error?.message || 'Une erreur est survenue lors du remboursement.');
          setSubmitting(false);
          return;
        }
      }
      onSuccess('Remboursement enregistré auprès de Stripe avec succès.');
      onClose();
    } catch {
      setError('Une erreur réseau est survenue.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="refund-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(37, 50, 79, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
        backdropFilter: 'blur(2px)',
      }}
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--paper, #ffffff)',
          borderRadius: '8px',
          width: '100%',
          maxWidth: '560px',
          boxShadow: '0 20px 25px -5px rgba(37, 50, 79, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--line, #dfe2e2)',
          maxHeight: '90vh',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--line, #dfe2e2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2
              id="refund-modal-title"
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--ink, #141414)',
                margin: 0,
              }}
            >
              Rembourser la commande
            </h2>
            <div style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', marginTop: '2px' }}>
              <CopyableReference value={commande.reference} prefix="CMD" /> · Client : {commande.client.name}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Fermer"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: submitting ? 'not-allowed' : 'pointer',
              color: 'var(--muted, #6b7280)',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px', overflowY: 'auto' }}>
          {error && (
            <div
              role="alert"
              style={{
                backgroundColor: 'var(--badge-danger-bg)',
                border: '1px solid var(--badge-danger-border)',
                color: 'var(--badge-danger-text)',
                padding: '10px 14px',
                borderRadius: '6px',
                marginBottom: '16px',
                fontSize: '13px',
              }}
            >
              {error}
            </div>
          )}

          {/* Quick presets */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button
              type="button"
              onClick={handleSetFull}
              disabled={submitting}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--navy-text, #25324f)',
                backgroundColor: 'var(--badge-neutral-bg)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: '4px',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              Tout rembourser (100 %)
            </button>
            <button
              type="button"
              onClick={handleResetSuggested}
              disabled={submitting}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--ink, #141414)',
                backgroundColor: 'var(--paper, #ffffff)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: '4px',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              Revenir à la suggestion
            </button>
          </div>

          {/* Itemized breakdown inputs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label
                htmlFor="refund-repair"
                style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '4px' }}
              >
                Prestation de réparation (max {formatEuros(commande.amounts.repairCents)}) :
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  id="refund-repair"
                  type="number"
                  min="0"
                  step="0.01"
                  max={commande.amounts.repairCents / 100}
                  value={(repairCents / 100).toFixed(2)}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setRepairCents(isNaN(val) ? 0 : Math.round(val * 100));
                  }}
                  disabled={submitting}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    fontSize: '14px',
                    border: '1px solid var(--line, #dfe2e2)',
                    borderRadius: '4px',
                  }}
                />
                <span style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>€</span>
              </div>
            </div>

            <div>
              <label
                htmlFor="refund-shipping"
                style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '4px' }}
              >
                Frais de livraison (max {formatEuros(commande.amounts.shippingCents)}) :
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  id="refund-shipping"
                  type="number"
                  min="0"
                  step="0.01"
                  max={commande.amounts.shippingCents / 100}
                  value={(shippingCents / 100).toFixed(2)}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setShippingCents(isNaN(val) ? 0 : Math.round(val * 100));
                  }}
                  disabled={submitting}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    fontSize: '14px',
                    border: '1px solid var(--line, #dfe2e2)',
                    borderRadius: '4px',
                  }}
                />
                <span style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>€</span>
              </div>
            </div>

            <div>
              <label
                htmlFor="refund-protection"
                style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '4px' }}
              >
                Protection REVIME (max {formatEuros(commande.amounts.protectionCents)}) :
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  id="refund-protection"
                  type="number"
                  min="0"
                  step="0.01"
                  max={commande.amounts.protectionCents / 100}
                  value={(protectionCents / 100).toFixed(2)}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setProtectionCents(isNaN(val) ? 0 : Math.round(val * 100));
                  }}
                  disabled={submitting}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    fontSize: '14px',
                    border: '1px solid var(--line, #dfe2e2)',
                    borderRadius: '4px',
                  }}
                />
                <span style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>€</span>
              </div>
            </div>
          </div>

          {/* Total Preview */}
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: 'var(--badge-neutral-bg)',
              borderRadius: '6px',
              border: '1px solid var(--line, #dfe2e2)',
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink, #141414)' }}>
              Total remboursé au client :
            </span>
            <strong style={{ fontSize: '16px', color: 'var(--navy-text, #25324f)' }}>
              {formatEuros(totalCents)}
            </strong>
          </div>

          {/* Motif selection */}
          <div style={{ marginBottom: '14px' }}>
            <label
              htmlFor="refund-motif"
              style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '4px' }}
            >
              Motif du remboursement :
            </label>
            <select
              id="refund-motif"
              value={motif}
              onChange={(e) => setMotif(e.target.value as RefundMotif)}
              disabled={submitting}
              required
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: '13px',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: '4px',
                backgroundColor: 'var(--paper, #ffffff)',
                color: 'var(--ink, #141414)',
              }}
            >
              <option value="">— Sélectionner un motif —</option>
              {MOTIF_LIST.map((m) => (
                <option key={m} value={m}>
                  {REFUND_MOTIF_LABEL[m]}
                </option>
              ))}
            </select>
          </div>

          {/* Note explicative */}
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="refund-note"
              style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '4px' }}
            >
              Note explicative (obligatoire) :
            </label>
            <textarea
              id="refund-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Préciser les raisons de ce remboursement..."
              disabled={submitting}
              required
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: '13px',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: '4px',
                boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Warning */}
          <div
            style={{
              fontSize: '12px',
              color: 'var(--badge-warning-text)',
              backgroundColor: 'var(--badge-warning-bg)',
              padding: '8px 12px',
              borderRadius: '4px',
              marginBottom: '20px',
              lineHeight: 1.4,
            }}
          >
            <Icon as={TriangleAlert} /> Ce montant sera immédiatement crédité sur le moyen de paiement Stripe du client. Cette opération est irréversible.
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '9px 16px',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--ink, #141414)',
                backgroundColor: 'var(--paper, #ffffff)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: '6px',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '9px 18px',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--on-accent, #ffffff)',
                backgroundColor: submitting ? 'var(--faint)' : 'var(--navy, #25324f)',
                border: 'none',
                borderRadius: '6px',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Traitement en cours…' : 'Confirmer le remboursement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
