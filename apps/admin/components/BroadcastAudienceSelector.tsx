'use client';

import { segmentForRole, locationFieldsEnabled } from '../lib/broadcast-audience';
import React from 'react';
import type { AdminBroadcastRecipientSuggestion, BroadcastTarget } from '@revime/shared';
import { RecipientPicker } from './RecipientPicker';

export interface BroadcastAudienceSelectorProps {
  target: BroadcastTarget;
  onChange: (target: BroadcastTarget) => void;
  /** The person picked for a single-recipient send, so the page can name them. */
  recipient?: AdminBroadcastRecipientSuggestion | null;
  onRecipientChange?: (recipient: AdminBroadcastRecipientSuggestion | null) => void;
  disabled?: boolean;
}

export function BroadcastAudienceSelector({
  target,
  onChange,
  recipient = null,
  onRecipientChange,
  disabled = false,
}: BroadcastAudienceSelectorProps) {
  const isSegment = target.type === 'SEGMENT';

  const handleTypeChange = (nextType: 'SEGMENT' | 'INDIVIDUAL') => {
    onRecipientChange?.(null);
    if (nextType === 'SEGMENT') {
      onChange({
        type: 'SEGMENT',
        role: 'ALL',
        city: '',
        department: '',
        verifiedOnly: false,
        activeOnly: true,
      });
    } else {
      onChange({
        type: 'INDIVIDUAL',
        userId: '',
      });
    }
  };

  return (
    <section
      className="card"
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        padding: '20px 24px',
        marginBottom: '20px',
      }}
      aria-labelledby="audience-selector-title"
    >
      <div style={{ marginBottom: '16px' }}>
        <h2
          id="audience-selector-title"
          style={{
            fontSize: '16px',
            fontWeight: 600,
            margin: '0 0 4px 0',
            color: 'var(--ink, #141414)',
          }}
        >
          1. Audience & Ciblage
        </h2>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
          Choisissez si la communication s’adresse à une population d’utilisateurs ou à un compte spécifique.
        </p>
      </div>

      {/* Target Type Toggle */}
      <div
        style={{
          display: 'inline-flex',
          gap: '4px',
          padding: '4px',
          backgroundColor: 'var(--badge-neutral-bg)',
          borderRadius: 'var(--r-field, 6px)',
          marginBottom: '20px',
        }}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleTypeChange('SEGMENT')}
          style={{
            padding: '6px 14px',
            fontSize: '13px',
            fontWeight: isSegment ? 600 : 500,
            color: isSegment ? 'var(--navy-text, #25324f)' : 'var(--muted, #6b7280)',
            backgroundColor: isSegment ? 'var(--paper, #ffffff)' : 'transparent',
            border: isSegment ? '1px solid var(--line, #dfe2e2)' : '1px solid transparent',
            borderRadius: '4px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            boxShadow: isSegment ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
          }}
        >
          Segment de membres
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleTypeChange('INDIVIDUAL')}
          style={{
            padding: '6px 14px',
            fontSize: '13px',
            fontWeight: !isSegment ? 600 : 500,
            color: !isSegment ? 'var(--navy-text, #25324f)' : 'var(--muted, #6b7280)',
            backgroundColor: !isSegment ? 'var(--paper, #ffffff)' : 'transparent',
            border: !isSegment ? '1px solid var(--line, #dfe2e2)' : '1px solid transparent',
            borderRadius: '4px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            boxShadow: !isSegment ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
          }}
        >
          Destinataire unique
        </button>
      </div>

      {isSegment ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <div>
            <label
              htmlFor="target-role"
              style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}
            >
              Rôle
            </label>
            <select
              id="target-role"
              value={target.role}
              disabled={disabled}
              onChange={(e) =>
                onChange(segmentForRole(target, e.target.value as 'ALL' | 'CLIENT' | 'REPAIRER'))
              }
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-field, 4px)',
                backgroundColor: 'var(--paper, #ffffff)',
                color: 'var(--ink, #141414)',
              }}
            >
              <option value="ALL">Tous les membres</option>
              <option value="CLIENT">Clients uniquement</option>
              <option value="REPAIRER">Réparateurs uniquement</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="target-city"
              style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}
            >
              Ville (optionnel)
            </label>
            <input
              id="target-city"
              type="text"
              placeholder={target.role === 'REPAIRER' ? 'Ex : Lyon, Paris, Bordeaux...' : 'Réservé aux réparateurs'}
              value={target.city ?? ''}
              disabled={disabled || !locationFieldsEnabled(target)}
              onChange={(e) => onChange({ ...target, city: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-field, 4px)',
                backgroundColor: 'var(--paper, #ffffff)',
                color: 'var(--ink, #141414)',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="target-dept"
              style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}
            >
              Département (optionnel)
            </label>
            <input
              id="target-dept"
              type="text"
              placeholder={target.role === 'REPAIRER' ? 'Ex : 69, 75, 33...' : 'Réservé aux réparateurs'}
              value={target.department ?? ''}
              disabled={disabled || !locationFieldsEnabled(target)}
              onChange={(e) => onChange({ ...target, department: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-field, 4px)',
                backgroundColor: 'var(--paper, #ffffff)',
                color: 'var(--ink, #141414)',
              }}
            />
          </div>

          <div
            style={{
              gridColumn: '1 / -1',
              display: 'flex',
              gap: '24px',
              flexWrap: 'wrap',
              marginTop: '4px',
              paddingTop: '12px',
              borderTop: '1px dashed var(--line, #dfe2e2)',
            }}
          >
            <label
              htmlFor="verified-only"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <input
                id="verified-only"
                type="checkbox"
                checked={Boolean(target.verifiedOnly)}
                disabled={disabled}
                onChange={(e) => onChange({ ...target, verifiedOnly: e.target.checked })}
              />
              Comptes vérifiés uniquement
            </label>

            <label
              htmlFor="active-only"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <input
                id="active-only"
                type="checkbox"
                checked={target.activeOnly !== false}
                disabled={disabled}
                onChange={(e) => onChange({ ...target, activeOnly: e.target.checked })}
              />
              Comptes actifs uniquement (hors suspendus)
            </label>
          </div>
        </div>
      ) : (
        // V7 D2 (U5): searched by pseudo, name or e-mail; the id is filled from the pick.
        <RecipientPicker
          picked={recipient}
          disabled={disabled}
          onPick={(s) => {
            onRecipientChange?.(s);
            onChange({ type: 'INDIVIDUAL', userId: s?.id ?? '' });
          }}
        />
      )}
    </section>
  );
}
