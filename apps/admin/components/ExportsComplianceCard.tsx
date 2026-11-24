'use client';

import React from 'react';
import { Scale } from 'lucide-react';
import { Icon } from './Icon';

export function ExportsComplianceCard() {
  const complianceItems = [
    {
      badge: 'Article 256 CGI',
      title: 'TVA standard 20 % sur commissions',
      description:
        "Revime applique le taux standard de TVA (20 %) sur les frais d'intermédiation et de protection perçus. La base HT est strictement isolée (Base HT = TTC / 1,20) et déclarée mensuellement au Trésor Public.",
      color: 'var(--badge-success-text)',
      bg: 'var(--badge-success-bg)',
    },
    {
      badge: 'Directive DAC7 & Art. 242 bis CGI',
      title: 'Déclaration fiscale annuelle des opérateurs',
      description:
        "En application de la directive européenne DAC7 (UE 2021/514), Revime transmet annuellement à l'administration fiscale le récapitulatif des sommes versées et du volume d'activité de chaque réparateur partenaire (1 ligne par SIREN/NIF).",
      color: 'var(--navy-text, #25324f)',
      bg: 'var(--badge-info-bg)',
    },
    {
      badge: 'Engagement Revime',
      title: '0 % de commission retenue sur le réparateur',
      description:
        '100 % du montant des devis de réparation est intégralement reversé aux réparateurs partenaires. Les frais de service et de protection sont supportés exclusivement par les clients finaux.',
      color: 'var(--badge-warning-text)',
      bg: 'var(--badge-warning-bg)',
    },
  ];

  return (
    <div
      data-testid="exports-compliance-card"
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        padding: '20px 24px',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
        marginBottom: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '20px' }} aria-hidden="true">
          <Icon as={Scale} />
        </span>
        <h3
          style={{
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--ink, #141414)',
            margin: 0,
          }}
        >
          Conformité fiscale &amp; Cadre légal
        </h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {complianceItems.map((item, idx) => (
          <div
            key={idx}
            style={{
              padding: '12px 14px',
              backgroundColor: 'var(--badge-neutral-bg)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  backgroundColor: item.bg,
                  color: item.color,
                }}
              >
                {item.badge}
              </span>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--ink, #141414)',
                }}
              >
                {item.title}
              </span>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: '12px',
                color: 'var(--muted, #6b7280)',
                lineHeight: 1.45,
              }}
            >
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
