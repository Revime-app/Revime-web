'use client';

import React from 'react';
import { getSeverityBadgeStyle } from './AlertsTable';
import { Lightbulb } from 'lucide-react';
import { Icon } from './Icon';

export function AlertsSlaCard() {
  const tiers = [
    {
      severity: 'CRITICAL' as const,
      badgeLabel: 'Critique',
      sla: 'SLA < 1h',
      description: 'Litiges contestés et signalements graves de fraude ou harcèlement.',
      response: 'Traitement immédiat requis sous 1 heure.',
    },
    {
      severity: 'HIGH' as const,
      badgeLabel: 'Élevée',
      sla: 'SLA < 4h',
      description: 'Échecs de paiement bancaire Stripe et blocages de virements.',
      response: 'Investigation et relance sous 4 heures.',
    },
    {
      severity: 'MEDIUM' as const,
      badgeLabel: 'Modérée',
      sla: 'SLA < 24h',
      description: 'Incidents logistiques, retards Boxtal ou transporteur.',
      response: 'Suivi et résolution sous 24 heures ouvrées.',
    },
  ];

  return (
    <div
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        padding: '16px',
      }}
    >
      <div style={{ marginBottom: '14px' }}>
        <h3
          style={{
            margin: '0 0 4px 0',
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--ink, #141414)',
          }}
        >
          Guide des SLA opérationnels
        </h3>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
          Objectifs de temps de réponse attendus selon le niveau d'urgence.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {tiers.map((tier) => {
          const badgeStyle = getSeverityBadgeStyle(tier.severity);
          return (
            <div
              key={tier.severity}
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--r-field, 4px)',
                backgroundColor: 'var(--badge-neutral-bg)',
                border: '1px solid var(--line, #dfe2e2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    ...badgeStyle,
                  }}
                >
                  {tier.badgeLabel}
                </span>

                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--navy-text, #25324f)',
                    fontFeatureSettings: '"tnum"',
                  }}
                >
                  {tier.sla}
                </span>
              </div>

              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--ink, #141414)',
                  lineHeight: '1.4',
                }}
              >
                {tier.description}
              </div>

              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--muted, #6b7280)',
                  fontStyle: 'italic',
                }}
              >
                {tier.response}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: '12px',
          padding: '8px 10px',
          borderRadius: '4px',
          backgroundColor: 'var(--badge-info-bg)',
          border: '1px solid var(--badge-info-bg)',
          fontSize: '11px',
          color: 'var(--badge-info-text)',
          lineHeight: '1.4',
        }}
      >
        <Icon as={Lightbulb} /> Les alertes critiques déclenchent un e-mail immédiat à l'équipe support et une relance prioritaire.
      </div>
    </div>
  );
}
