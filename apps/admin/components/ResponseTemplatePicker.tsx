'use client';

import { useState } from 'react';
import { DISPUTE_RESPONSE_TEMPLATES, type DisputeResponseTemplate } from '@revime/shared';
import { ClipboardList, Clock, Eye, FileText, Handshake, Scale } from 'lucide-react';
import { Icon } from './Icon';
import type { LucideIcon } from 'lucide-react';

export interface ResponseTemplatePickerProps {
  onSelectTemplate: (templateText: string) => void;
}

function getCategoryIcon(category: DisputeResponseTemplate['category']): LucideIcon {
  switch (category) {
    case 'INFO_REQUEST':
      return FileText;
    case 'DEADLINE_REMINDER':
      return Clock;
    case 'MEDIATION_PROPOSAL':
      return Handshake;
    case 'ARBITRATION_NOTICE':
      return Scale;
    default:
      return ClipboardList;
  }
}

export function ResponseTemplatePicker({ onSelectTemplate }: ResponseTemplatePickerProps) {
  const [previewTemplate, setPreviewTemplate] = useState<DisputeResponseTemplate | null>(null);

  const handleApply = (template: DisputeResponseTemplate) => {
    onSelectTemplate(template.body);
    setPreviewTemplate(null);
  };

  return (
    <div
      data-testid="response-template-picker"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px 14px',
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        marginBottom: '10px',
        fontFamily: 'var(--font-google-sans), Arial, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <span
          style={{
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--navy-deep-text, #1e293b)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span><Icon as={ClipboardList} /></span> Modèles de réponse pour la médiation :
        </span>

        {previewTemplate && (
          <button
            type="button"
            onClick={() => setPreviewTemplate(null)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '11px',
              color: 'var(--muted, #6b7280)',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            Fermer l'aperçu
          </button>
        )}
      </div>

      {/* Pill buttons for each template */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        {DISPUTE_RESPONSE_TEMPLATES.map((tmpl) => {
          const isSelected = previewTemplate?.id === tmpl.id;
          return (
            <div
              key={tmpl.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: '6px',
                border: isSelected ? '1px solid var(--navy, #25324f)' : '1px solid var(--line, #dfe2e2)',
                backgroundColor: isSelected ? 'var(--badge-neutral-bg)' : 'var(--paper)',
                overflow: 'hidden',
                transition: 'all 0.15s ease',
              }}
            >
              <button
                type="button"
                data-testid={`template-btn-${tmpl.id}`}
                onClick={() => handleApply(tmpl)}
                title="Insérer directement ce modèle dans le message"
                style={{
                  padding: '6px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--navy-text, #25324f)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span><Icon as={getCategoryIcon(tmpl.category)} /></span>
                <span>{tmpl.title}</span>
              </button>

              <button
                type="button"
                data-testid={`template-preview-btn-${tmpl.id}`}
                onClick={() => setPreviewTemplate(isSelected ? null : tmpl)}
                title="Aperçu du texte"
                style={{
                  padding: '6px 8px',
                  fontSize: '11px',
                  color: 'var(--muted, #6b7280)',
                  background: 'transparent',
                  border: 'none',
                  borderLeft: '1px solid var(--line, #dfe2e2)',
                  cursor: 'pointer',
                }}
              >
                <Icon as={Eye} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Preview box if a template preview is toggled */}
      {previewTemplate && (
        <div
          data-testid="template-preview-box"
          style={{
            marginTop: '6px',
            padding: '12px 14px',
            backgroundColor: 'var(--badge-neutral-bg)',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--navy-deep-text, #1e293b)' }}>
              Aperçu : {previewTemplate.title}
            </span>
            <button
              type="button"
              data-testid="template-apply-preview-btn"
              onClick={() => handleApply(previewTemplate)}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: 'var(--navy, #25324f)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Insérer dans la réponse
            </button>
          </div>

          <pre
            style={{
              margin: 0,
              fontSize: '12px',
              fontFamily: 'inherit',
              whiteSpace: 'pre-wrap',
              color: 'var(--navy-deep-text, #1e293b)',
              lineHeight: 1.5,
              backgroundColor: 'var(--paper)',
              padding: '10px',
              borderRadius: '4px',
              border: '1px solid var(--line, #dfe2e2)',
            }}
          >
            {previewTemplate.body}
          </pre>
        </div>
      )}
    </div>
  );
}
