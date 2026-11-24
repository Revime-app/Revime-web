'use client';

import React, { useRef } from 'react';
import { Bell, Mail } from 'lucide-react';
import { Icon } from './Icon';

export type TemplatePresetKey =
  | 'CUSTOM'
  | 'ANNOUNCEMENT'
  | 'REPAIRER_OPPORTUNITY'
  | 'VERIFICATION_REMINDER'
  | 'MAINTENANCE';

export interface BroadcastComposerProps {
  channels: { email: boolean; push: boolean };
  onChannelsChange: (channels: { email: boolean; push: boolean }) => void;
  templateKey: TemplatePresetKey;
  onTemplateKeyChange: (key: TemplatePresetKey) => void;
  subject: string;
  onSubjectChange: (subject: string) => void;
  body: string;
  onBodyChange: (body: string) => void;
  disabled?: boolean;
}

export const TEMPLATE_PRESETS: Record<
  TemplatePresetKey,
  { label: string; subject: string; body: string }
> = {
  CUSTOM: {
    label: 'Message libre',
    subject: '',
    body: '',
  },
  ANNOUNCEMENT: {
    label: 'Annonce générale',
    subject: 'Nouvelle mise à jour sur Revime',
    body: 'Bonjour {{prenom}},\n\nNous avons le plaisir de vous annoncer des nouveautés sur votre plateforme Revime. Rendez-vous sur votre espace pour les découvrir !',
  },
  REPAIRER_OPPORTUNITY: {
    label: 'Opportunité locale (Réparateurs)',
    subject: 'Forte demande de réparations dans votre secteur',
    body: 'Bonjour {{prenom}},\n\nDe nouvelles demandes de réparation sont disponibles à {{ville}}. Rendez-vous sur votre espace artisan pour y répondre sans tarder.',
  },
  VERIFICATION_REMINDER: {
    label: "Rappel vérification d'identité",
    subject: 'Finalisez la vérification de votre compte Revime',
    body: "Bonjour {{prenom}},\n\nPour continuer à proposer vos services en toute sérénité, merci de déposer votre pièce d'identité et votre justificatif de statut professionnel sur votre profil Revime.",
  },
  MAINTENANCE: {
    label: 'Maintenance de la plateforme',
    subject: 'Maintenance planifiée de la plateforme Revime',
    body: "Bonjour {{prenom}},\n\nUne opération de maintenance technique aura lieu prochainement afin d'améliorer la qualité et la sécurité de nos services.",
  },
};

export const AVAILABLE_TOKENS = [
  { token: '{{prenom}}', label: 'Prénom', hint: 'Prénom du destinataire' },
  { token: '{{nom}}', label: 'Nom', hint: 'Nom de famille' },
  { token: '{{ville}}', label: 'Ville', hint: 'Ville de résidence ou atelier' },
];

export function BroadcastComposer({
  channels,
  onChannelsChange,
  templateKey,
  onTemplateKeyChange,
  subject,
  onSubjectChange,
  body,
  onBodyChange,
  disabled = false,
}: BroadcastComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handlePresetSelect = (preset: TemplatePresetKey) => {
    onTemplateKeyChange(preset);
    if (preset !== 'CUSTOM') {
      const template = TEMPLATE_PRESETS[preset];
      if (template) {
        onSubjectChange(template.subject);
        onBodyChange(template.body);
      }
    }
  };

  const insertToken = (token: string) => {
    if (disabled) return;
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = body;
      const newText = text.substring(0, start) + token + text.substring(end);
      onBodyChange(newText);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + token.length, start + token.length);
      }, 0);
    } else {
      onBodyChange(body ? `${body} ${token}` : token);
    }
  };

  const channelCount = (channels.email ? 1 : 0) + (channels.push ? 1 : 0);
  const channelError = channelCount === 0;

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
      aria-labelledby="composer-title"
    >
      <div style={{ marginBottom: '16px' }}>
        <h2
          id="composer-title"
          style={{
            fontSize: '16px',
            fontWeight: 600,
            margin: '0 0 4px 0',
            color: 'var(--ink, #141414)',
          }}
        >
          2. Canaux & Rédaction
        </h2>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
          Configurez les canaux de diffusion, chargez un modèle pré-rempli ou composez votre message personnalisé.
        </p>
      </div>

      {/* Channels row */}
      <div style={{ marginBottom: '20px' }}>
        <span
          style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 500,
            marginBottom: '8px',
            color: channelError ? 'var(--red-text, #bd0e26)' : 'var(--ink, #141414)',
          }}
        >
          Canaux de diffusion {channelError && '— Au moins un canal requis'}
        </span>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <label
            htmlFor="channel-email"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              fontWeight: channels.email ? 600 : 400,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            <input
              id="channel-email"
              type="checkbox"
              checked={channels.email}
              disabled={disabled}
              onChange={(e) => onChannelsChange({ ...channels, email: e.target.checked })}
            />
            <Icon as={Mail} /> E-mail
          </label>

          <label
            htmlFor="channel-push"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              fontWeight: channels.push ? 600 : 400,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            <input
              id="channel-push"
              type="checkbox"
              checked={channels.push}
              disabled={disabled}
              onChange={(e) => onChannelsChange({ ...channels, push: e.target.checked })}
            />
            <Icon as={Bell} /> Push mobile
          </label>
        </div>
      </div>

      {/* Template Presets */}
      <div style={{ marginBottom: '20px' }}>
        <label
          htmlFor="template-preset-select"
          style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}
        >
          Modèle prédéfini (optionnel)
        </label>
        <select
          id="template-preset-select"
          value={templateKey}
          disabled={disabled}
          onChange={(e) => handlePresetSelect(e.target.value as TemplatePresetKey)}
          style={{
            width: '100%',
            maxWidth: '400px',
            padding: '8px 12px',
            fontSize: '14px',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: 'var(--r-field, 4px)',
            backgroundColor: 'var(--paper, #ffffff)',
            color: 'var(--ink, #141414)',
          }}
        >
          {Object.entries(TEMPLATE_PRESETS).map(([key, val]) => (
            <option key={key} value={key}>
              {val.label}
            </option>
          ))}
        </select>
      </div>

      {/* Subject input */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <label htmlFor="broadcast-subject" style={{ fontSize: '13px', fontWeight: 500 }}>
            Objet / Titre de la notification
          </label>
          <span style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}>
            {subject.length} / 150
          </span>
        </div>
        <input
          id="broadcast-subject"
          type="text"
          placeholder="Ex : Nouvelle opportunité de réparation à proximité"
          value={subject}
          maxLength={150}
          disabled={disabled}
          onChange={(e) => onSubjectChange(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: '14px',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: 'var(--r-field, 4px)',
            backgroundColor: 'var(--paper, #ffffff)',
            color: 'var(--ink, #141414)',
          }}
        />
      </div>

      {/* Token insertion bar */}
      <div style={{ marginBottom: '8px' }}>
        <span style={{ fontSize: '12px', color: 'var(--muted, #6b7280)', marginRight: '8px' }}>
          Variables personnalisées :
        </span>
        <div style={{ display: 'inline-flex', gap: '8px', flexWrap: 'wrap' }}>
          {AVAILABLE_TOKENS.map((item) => (
            <button
              key={item.token}
              type="button"
              disabled={disabled}
              onClick={() => insertToken(item.token)}
              title={item.hint}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 10px',
                fontSize: '12px',
                fontFamily: 'monospace',
                fontWeight: 600,
                color: 'var(--navy-text, #25324f)',
                backgroundColor: 'var(--badge-info-bg)',
                border: '1px solid var(--badge-info-border)',
                borderRadius: '9999px',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              + {item.token}
            </button>
          ))}
        </div>
      </div>

      {/* Body textarea */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <label htmlFor="broadcast-body" style={{ fontSize: '13px', fontWeight: 500 }}>
            Corps du message
          </label>
          <span style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}>
            {body.length} / 5000
          </span>
        </div>
        <textarea
          id="broadcast-body"
          ref={textareaRef}
          rows={6}
          placeholder="Écrivez votre message ici... Les variables {{prenom}}, {{nom}} et {{ville}} seront automatiquement remplacées pour chaque destinataire."
          value={body}
          maxLength={5000}
          disabled={disabled}
          onChange={(e) => onBodyChange(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: '14px',
            lineHeight: '1.5',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: 'var(--r-field, 4px)',
            backgroundColor: 'var(--paper, #ffffff)',
            color: 'var(--ink, #141414)',
            fontFamily: 'inherit',
          }}
        />
      </div>
    </section>
  );
}
