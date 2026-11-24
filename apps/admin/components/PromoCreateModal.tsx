'use client';

import React, { useState, useEffect } from 'react';
import type { PromoCodeCreateInput, PromoType } from '@revime/shared';
import { formatEuros } from '../lib/money';
import { ChartColumn, TriangleAlert, Zap } from 'lucide-react';
import { Icon } from './Icon';

export interface PromoCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (input: PromoCodeCreateInput) => Promise<void> | void;
  submitting?: boolean;
}

export function generateRandomCode(prefix = 'PROMO'): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 6; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${rand}`;
}

export function PromoCreateModal({
  isOpen,
  onClose,
  onCreate,
  submitting = false,
}: PromoCreateModalProps) {
  // Form state
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<PromoType>('FIXED_AMOUNT');
  const [valueInput, setValueInput] = useState('10'); // in € or %
  const [maxDiscountInput, setMaxDiscountInput] = useState(''); // in € for % promo
  const [minOrderInput, setMinOrderInput] = useState('0'); // in €
  const [maxUsesTotalInput, setMaxUsesTotalInput] = useState('');
  const [maxUsesPerUserInput, setMaxUsesPerUserInput] = useState('1');
  const [firstOrderOnly, setFirstOrderOnly] = useState(false);
  const [startsAtInput, setStartsAtInput] = useState('');
  const [expiresAtInput, setExpiresAtInput] = useState('');

  // Simulator basket amount
  const [simulatedBasketEuro, setSimulatedBasketEuro] = useState('50');

  const [validationError, setValidationError] = useState<string | null>(null);

  // Reset or initialize on open
  useEffect(() => {
    if (isOpen) {
      setCode(generateRandomCode('PROMO'));
      setDescription('');
      setType('FIXED_AMOUNT');
      setValueInput('10');
      setMaxDiscountInput('');
      setMinOrderInput('0');
      setMaxUsesTotalInput('');
      setMaxUsesPerUserInput('1');
      setFirstOrderOnly(false);
      setStartsAtInput('');
      setExpiresAtInput('');
      setValidationError(null);
    }
  }, [isOpen]);

  // Escape key closes modal
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

  // Simulator calculation
  const parsedBasketEuro = parseFloat(simulatedBasketEuro) || 0;
  const parsedBasketCents = Math.round(parsedBasketEuro * 100);
  const parsedValueNum = parseFloat(valueInput) || 0;
  const parsedMaxDiscountNum = parseFloat(maxDiscountInput) || 0;
  const parsedMinOrderNum = parseFloat(minOrderInput) || 0;
  const parsedMinOrderCents = Math.round(parsedMinOrderNum * 100);

  let simulatedDiscountCents = 0;
  if (parsedBasketCents >= parsedMinOrderCents) {
    if (type === 'FIXED_AMOUNT') {
      const fixedCents = Math.round(parsedValueNum * 100);
      simulatedDiscountCents = Math.min(fixedCents, parsedBasketCents);
    } else {
      const rawDiscount = Math.round((parsedBasketCents * parsedValueNum) / 100);
      const capped =
        parsedMaxDiscountNum > 0
          ? Math.min(rawDiscount, Math.round(parsedMaxDiscountNum * 100))
          : rawDiscount;
      simulatedDiscountCents = Math.min(capped, parsedBasketCents);
    }
  }
  const simulatedPayableCents = Math.max(0, parsedBasketCents - simulatedDiscountCents);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const cleanCode = code.trim().toUpperCase();
    if (cleanCode.length < 3) {
      setValidationError('Le code doit comporter au moins 3 caractères.');
      return;
    }
    if (!/^[A-Za-z0-9_-]+$/.test(cleanCode)) {
      setValidationError('Le code ne doit contenir que des lettres, chiffres, tirets et underscores.');
      return;
    }

    const numValue = parseFloat(valueInput);
    if (!numValue || numValue <= 0) {
      setValidationError('La valeur de la réduction doit être supérieure à zéro.');
      return;
    }

    let valueCents = 0;
    if (type === 'FIXED_AMOUNT') {
      valueCents = Math.round(numValue * 100);
    } else {
      if (numValue > 100) {
        setValidationError('Le pourcentage ne peut excéder 100%.');
        return;
      }
      valueCents = Math.round(numValue);
    }

    const payload: PromoCodeCreateInput = {
      code: cleanCode,
      description: description.trim() || undefined,
      type,
      valueCents,
      minOrderCents: parsedMinOrderCents,
      maxUsesPerUser: parseInt(maxUsesPerUserInput, 10) || 1,
      firstOrderOnly,
    };

    if (maxDiscountInput.trim()) {
      const maxDisc = parseFloat(maxDiscountInput);
      if (maxDisc > 0) {
        payload.maxDiscountCents = Math.round(maxDisc * 100);
      }
    }

    if (maxUsesTotalInput.trim()) {
      const maxTotal = parseInt(maxUsesTotalInput, 10);
      if (maxTotal > 0) {
        payload.maxUsesTotal = maxTotal;
      }
    }

    if (startsAtInput.trim()) {
      payload.startsAt = new Date(startsAtInput).toISOString();
    }

    if (expiresAtInput.trim()) {
      payload.expiresAt = new Date(expiresAtInput).toISOString();
    }

    try {
      await onCreate(payload);
    } catch (err: any) {
      setValidationError(err.message || 'Erreur lors de la création du code promotionnel.');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="promo-create-title"
        style={{
          backgroundColor: 'var(--paper, #ffffff)',
          borderRadius: 'var(--r-card, 8px)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          maxWidth: '620px',
          width: '100%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--line, #dfe2e2)',
          }}
        >
          <h2
            id="promo-create-title"
            style={{
              fontSize: '18px',
              fontWeight: 700,
              margin: '0 0 6px 0',
              color: 'var(--ink, #141414)',
            }}
          >
            Créer un code promotionnel
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
            Configurez une réduction fixe ou en pourcentage subventionnée par Revime.
          </p>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div
            style={{
              padding: '20px 24px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {validationError && (
              <div
                role="alert"
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--r-field, 4px)',
                  backgroundColor: 'var(--red-soft, #feedf0)',
                  border: '1px solid var(--badge-danger-border)',
                  color: 'var(--red-text, #bd0e26)',
                  fontSize: '13px',
                }}
              >
                {validationError}
              </div>
            )}

            {/* Code & Generate Button */}
            <div>
              <label
                htmlFor="promo-code-input"
                style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '6px' }}
              >
                Code promo *
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="promo-code-input"
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Ex: ETE2026, BIENVENUE10"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: '14px',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    fontFamily: 'monospace',
                    borderRadius: 'var(--r-field, 4px)',
                    border: '1px solid var(--line, #dfe2e2)',
                    backgroundColor: 'var(--paper)',
                    color: 'var(--ink, #141414)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setCode(generateRandomCode('PROMO'))}
                  style={{
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: 500,
                    borderRadius: 'var(--r-field, 4px)',
                    border: '1px solid var(--line, #dfe2e2)',
                    backgroundColor: 'var(--badge-neutral-bg)',
                    color: 'var(--navy-text, #25324f)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Icon as={Zap} /> Générer aléatoire
                </button>
              </div>
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="promo-desc-input"
                style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '6px' }}
              >
                Description interne (optionnelle)
              </label>
              <input
                id="promo-desc-input"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Campagne d’acquisition rentrée septembre"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '13px',
                  borderRadius: 'var(--r-field, 4px)',
                  border: '1px solid var(--line, #dfe2e2)',
                  backgroundColor: 'var(--paper)',
                  color: 'var(--ink, #141414)',
                }}
              />
            </div>

            {/* Type & Valeur Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label
                  htmlFor="promo-type-select"
                  style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '6px' }}
                >
                  Type de réduction *
                </label>
                <select
                  id="promo-type-select"
                  value={type}
                  onChange={(e) => setType(e.target.value as PromoType)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '13px',
                    borderRadius: 'var(--r-field, 4px)',
                    border: '1px solid var(--line, #dfe2e2)',
                    backgroundColor: 'var(--paper)',
                    color: 'var(--ink, #141414)',
                  }}
                >
                  <option value="FIXED_AMOUNT">Remise fixe (€)</option>
                  <option value="PERCENTAGE">Remise pourcentage (%)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="promo-value-input"
                  style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '6px' }}
                >
                  {type === 'FIXED_AMOUNT' ? 'Valeur en Euros (€) *' : 'Pourcentage (%) *'}
                </label>
                <input
                  id="promo-value-input"
                  type="number"
                  min={type === 'FIXED_AMOUNT' ? '0.01' : '1'}
                  step={type === 'FIXED_AMOUNT' ? '0.01' : '1'}
                  max={type === 'PERCENTAGE' ? '100' : undefined}
                  required
                  value={valueInput}
                  onChange={(e) => setValueInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '13px',
                    borderRadius: 'var(--r-field, 4px)',
                    border: '1px solid var(--line, #dfe2e2)',
                    backgroundColor: 'var(--paper)',
                    color: 'var(--ink, #141414)',
                  }}
                />
              </div>
            </div>

            {/* Plafond max pour pourcentage & Panier minimum */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label
                  htmlFor="promo-max-discount-input"
                  style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '6px' }}
                >
                  Plafond max réduction (€)
                </label>
                <input
                  id="promo-max-discount-input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  disabled={type !== 'PERCENTAGE'}
                  value={maxDiscountInput}
                  onChange={(e) => setMaxDiscountInput(e.target.value)}
                  placeholder={type === 'PERCENTAGE' ? 'Ex: 50 €' : 'Non applicable'}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '13px',
                    borderRadius: 'var(--r-field, 4px)',
                    border: '1px solid var(--line, #dfe2e2)',
                    backgroundColor: type === 'PERCENTAGE' ? 'var(--paper)' : 'var(--badge-neutral-bg)',
                    color: 'var(--ink, #141414)',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="promo-min-order-input"
                  style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '6px' }}
                >
                  Panier minimum (€)
                </label>
                <input
                  id="promo-min-order-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={minOrderInput}
                  onChange={(e) => setMinOrderInput(e.target.value)}
                  placeholder="0 pour aucun"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '13px',
                    borderRadius: 'var(--r-field, 4px)',
                    border: '1px solid var(--line, #dfe2e2)',
                    backgroundColor: 'var(--paper)',
                    color: 'var(--ink, #141414)',
                  }}
                />
              </div>
            </div>

            {/* Limites d'utilisations */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label
                  htmlFor="promo-max-total-input"
                  style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '6px' }}
                >
                  Limite totale d'utilisations
                </label>
                <input
                  id="promo-max-total-input"
                  type="number"
                  min="1"
                  step="1"
                  value={maxUsesTotalInput}
                  onChange={(e) => setMaxUsesTotalInput(e.target.value)}
                  placeholder="Vide pour illimité"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '13px',
                    borderRadius: 'var(--r-field, 4px)',
                    border: '1px solid var(--line, #dfe2e2)',
                    backgroundColor: 'var(--paper)',
                    color: 'var(--ink, #141414)',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="promo-max-user-input"
                  style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '6px' }}
                >
                  Limite par utilisateur
                </label>
                <input
                  id="promo-max-user-input"
                  type="number"
                  min="1"
                  step="1"
                  value={maxUsesPerUserInput}
                  onChange={(e) => setMaxUsesPerUserInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '13px',
                    borderRadius: 'var(--r-field, 4px)',
                    border: '1px solid var(--line, #dfe2e2)',
                    backgroundColor: 'var(--paper)',
                    color: 'var(--ink, #141414)',
                  }}
                />
              </div>
            </div>

            {/* Checkbox Première commande */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                id="promo-first-order-checkbox"
                type="checkbox"
                checked={firstOrderOnly}
                onChange={(e) => setFirstOrderOnly(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label
                htmlFor="promo-first-order-checkbox"
                style={{ fontSize: '13px', color: 'var(--ink, #141414)', cursor: 'pointer' }}
              >
                Réservé exclusivement à la <strong>première commande</strong> du client
              </label>
            </div>

            {/* Dates début et expiration */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label
                  htmlFor="promo-starts-at-input"
                  style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '6px' }}
                >
                  Date de début (optionnelle)
                </label>
                <input
                  id="promo-starts-at-input"
                  type="date"
                  value={startsAtInput}
                  onChange={(e) => setStartsAtInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '13px',
                    borderRadius: 'var(--r-field, 4px)',
                    border: '1px solid var(--line, #dfe2e2)',
                    backgroundColor: 'var(--paper)',
                    color: 'var(--ink, #141414)',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="promo-expires-at-input"
                  style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '6px' }}
                >
                  Date d'expiration (optionnelle)
                </label>
                <input
                  id="promo-expires-at-input"
                  type="date"
                  value={expiresAtInput}
                  onChange={(e) => setExpiresAtInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '13px',
                    borderRadius: 'var(--r-field, 4px)',
                    border: '1px solid var(--line, #dfe2e2)',
                    backgroundColor: 'var(--paper)',
                    color: 'var(--ink, #141414)',
                  }}
                />
              </div>
            </div>

            {/* Live Discount Calculation Simulator */}
            <div
              style={{
                marginTop: '8px',
                padding: '14px 16px',
                borderRadius: 'var(--r-field, 6px)',
                backgroundColor: 'var(--badge-neutral-bg)',
                border: '1px solid var(--line, #dfe2e2)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px',
                }}
              >
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--navy-text, #25324f)' }}>
                  <Icon as={ChartColumn} /> Simulateur de panier en direct
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label htmlFor="sim-basket-input" style={{ fontSize: '11px', color: 'var(--muted, #6b7280)' }}>
                    Panier test (€) :
                  </label>
                  <input
                    id="sim-basket-input"
                    type="number"
                    min="0"
                    step="any"
                    value={simulatedBasketEuro}
                    onChange={(e) => setSimulatedBasketEuro(e.target.value)}
                    style={{
                      width: '64px',
                      padding: '2px 6px',
                      fontSize: '12px',
                      borderRadius: '4px',
                      border: '1px solid var(--line, #dfe2e2)',
                      backgroundColor: 'var(--paper)',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <div>
                  <span style={{ color: 'var(--muted, #6b7280)' }}>Réduction appliquée : </span>
                  <strong style={{ color: 'var(--navy-text, #f61b39)' }}>
                    -{formatEuros(simulatedDiscountCents)}
                  </strong>
                </div>
                <div>
                  <span style={{ color: 'var(--muted, #6b7280)' }}>Reste à payer : </span>
                  <strong style={{ color: 'var(--navy-text, #25324f)' }}>
                    {formatEuros(simulatedPayableCents)}
                  </strong>
                </div>
              </div>
              {parsedBasketCents < parsedMinOrderCents && (
                <div style={{ fontSize: '11px', color: 'var(--badge-warning-text)', marginTop: '6px' }}>
                  <Icon as={TriangleAlert} /> Le panier test ({formatEuros(parsedBasketCents)}) est inférieur au minimum requis ({formatEuros(parsedMinOrderCents)}).
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--line, #dfe2e2)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              backgroundColor: 'var(--badge-neutral-bg)',
            }}
          >
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 500,
                backgroundColor: 'var(--paper)',
                color: 'var(--ink, #141414)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-field, 4px)',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '8px 20px',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: 'var(--navy, #25324f)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--r-field, 4px)',
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Création en cours…' : 'Créer le code promo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
