'use client';

import React from 'react';
import type { AdminBroadcastPreview } from '@revime/shared';
import { pushReach, pushReachWarning, reachCounts } from '../lib/broadcast-audience';
import { Bell, Mail } from 'lucide-react';
import { Icon } from './Icon';

export interface BroadcastPreviewCardProps {
  preview: AdminBroadcastPreview | null;
  loading?: boolean;
  subject: string;
  body: string;
  channels: { email: boolean; push: boolean };
  /** A campaign to a segment with a commercial template reaches only the members who opted in. */
  consentRestricted: boolean;
}

export function replaceTokens(
  template: string,
  sample?: { name: string; city: string | null }
): string {
  if (!template) return '';
  const parts = (sample?.name ?? 'Alexandre Martin').trim().split(/\s+/);
  const prenom = parts[0] || 'Alexandre';
  const nom = parts.slice(1).join(' ') || 'Martin';
  const ville = sample?.city || 'Paris';

  return template
    .replace(/\{\{\s*prenom\s*\}\}/gi, prenom)
    .replace(/\{\{\s*nom\s*\}\}/gi, nom)
    .replace(/\{\{\s*ville\s*\}\}/gi, ville);
}

export function BroadcastPreviewCard({
  preview,
  loading = false,
  subject,
  body,
  channels,
  consentRestricted,
}: BroadcastPreviewCardProps) {
  const { total, email: emailCount } = reachCounts(preview, consentRestricted);
  const push = pushReach(preview, consentRestricted);
  const pushWarning = pushReachWarning(preview, consentRestricted, channels.push);
  const sample = preview?.sampleRecipients?.[0];

  const simulatedSubject = replaceTokens(subject, sample);
  const simulatedBody = replaceTokens(body, sample);

  return (
    <aside
      className="card"
      style={{
        position: 'sticky',
        top: '24px',
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
      aria-label="Aperçu en direct"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0, color: 'var(--ink, #141414)' }}>
          Aperçu de diffusion
        </h3>
        {loading && (
          <span style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}>
            Calcul en cours…
          </span>
        )}
      </div>

      {/* Audience Stats Badge */}
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 'var(--r-field, 6px)',
          backgroundColor: 'var(--badge-neutral-bg)',
          border: '1px solid var(--line, #dfe2e2)',
          marginBottom: '20px',
        }}
      >
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted, #6b7280)', marginBottom: '4px' }}>
          Portée estimée
        </div>
        <div
          style={{
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--navy-text, #25324f)',
            marginBottom: '4px',
          }}
        >
          {`${total} ${total === 1 ? 'destinataire' : 'destinataires'}`}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--ink, #141414)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span>{emailCount} avec e-mail{consentRestricted ? ' et accord marketing' : ''}</span>
          {/* V7 D1 (U6): who push really reaches, per platform, and why the others are out. */}
          <span style={{ fontWeight: 600, marginTop: '4px' }}>
            Joignables en push : {push.reachable}
            {consentRestricted ? ' (accord marketing)' : ''}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}>
            iOS {push.ios} · Android {push.android}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}>
            {/* One string: Next's compiler dropped the space before a JSX text holding `&apos;` (V7 ISS7-038). */}
            {`${push.noDevice} sans l'application ou avec les notifications désactivées`}
          </span>
          {push.noConsent !== null ? (
            <span style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}>
              {push.noConsent} avec les notifications mais sans avoir accepté les communications commerciales
            </span>
          ) : null}
          {pushWarning ? (
            <span
              role="alert"
              style={{ fontSize: '12px', fontWeight: 500, color: 'var(--red-text, #bd0e26)', marginTop: '4px' }}
            >
              {pushWarning}
            </span>
          ) : null}
          {consentRestricted ? (
            <span style={{ fontSize: '12px', color: 'var(--muted, #6b7280)', marginTop: '4px' }}>
              Un message commercial n&apos;est envoyé qu&apos;aux membres qui ont accepté de recevoir des
              communications. Une information de service (maintenance, rappel de vérification) part à tous.
            </span>
          ) : null}
        </div>
      </div>

      {/* Selected Channels Summary */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted, #6b7280)', marginBottom: '6px' }}>
          Canaux activés
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {channels.email && (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: '4px',
                backgroundColor: 'var(--badge-info-bg)',
                color: 'var(--navy-text, #25324f)',
                border: '1px solid var(--badge-info-border)',
              }}
            >
              <Icon as={Mail} /> E-mail
            </span>
          )}
          {channels.push && (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: '4px',
                backgroundColor: 'var(--badge-warning-bg)',
                color: 'var(--badge-warning-text)',
                border: '1px solid var(--badge-warning-border)',
              }}
            >
              <Icon as={Bell} /> Push mobile
            </span>
          )}
          {!channels.email && !channels.push && (
            <span
              style={{
                fontSize: '12px',
                color: 'var(--red-text, #bd0e26)',
                fontWeight: 500,
              }}
            >
              Aucun canal sélectionné
            </span>
          )}
        </div>
      </div>

      {/* Live Sample Simulation */}
      <div>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted, #6b7280)', marginBottom: '8px' }}>
          {sample
            ? `Simulation pour ${sample.name} (${sample.city ?? 'Ville non renseignée'})`
            : 'Simulation personnalisée'}
        </div>

        <div
          style={{
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: 'var(--r-field, 6px)',
            padding: '12px 14px',
            backgroundColor: 'var(--paper)',
          }}
        >
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--ink, #141414)',
              marginBottom: '8px',
              paddingBottom: '8px',
              borderBottom: '1px solid var(--badge-neutral-bg)',
            }}
          >
            {simulatedSubject || (
              <span style={{ color: 'var(--muted, #6b7280)', fontStyle: 'italic', fontWeight: 400 }}>
                Objet du message…
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: '13px',
              color: 'var(--ink, #141414)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.5,
              minHeight: '60px',
            }}
          >
            {simulatedBody || (
              <span style={{ color: 'var(--muted, #6b7280)', fontStyle: 'italic' }}>
                Le corps de votre message s’affichera ici avec le remplacement des variables…
              </span>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
