import React from 'react';
import { httpsUrlOrNull } from '@revime/shared';
import { Lightbulb } from 'lucide-react';
import { Icon } from './Icon';

export interface TipAppPreviewProps {
  text: string;
  imageUrl?: string | null;
  linkUrl?: string | null;
}

/**
 * The app's « Conseil du jour » card (`apps/mobile/src/components/TipCard.tsx`): a light bulb, the title,
 * the text, then the image and the « En savoir plus » link when the tip has them. It draws exactly that
 * and nothing the card does not have (the pool is chosen by the app's mode, it is not printed on the
 * card). An address that is not https is not drawn, as in the app.
 */
export function TipAppPreview({ text, imageUrl, linkUrl }: TipAppPreviewProps) {
  const cleanImage = httpsUrlOrNull(imageUrl);
  const cleanLink = httpsUrlOrNull(linkUrl);

  return (
    <div
      data-testid="tip-app-preview"
      style={{
        width: 320,
        minWidth: 280,
        maxWidth: '100%',
        backgroundColor: 'var(--paper)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 24,
        padding: '16px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
        fontFamily: 'var(--font-google-sans), Arial, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Mobile Frame Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 8,
          borderBottom: '1px solid var(--badge-neutral-bg)',
          fontSize: 11,
          color: 'var(--muted, #6b7280)',
          fontWeight: 600,
        }}
      >
        <span>9:41</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span>●●●</span>
          <span>Aperçu de la carte du jour</span>
        </div>
      </div>

      {/* Realistic In-App Tip Card */}
      <div
        style={{
          backgroundColor: 'var(--badge-neutral-bg)',
          borderRadius: 16,
          padding: 16,
          border: '1px solid var(--line)',
        }}
      >
        {/* Top row: Glyph + Pool Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: 'var(--paper)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            }}
            aria-hidden="true"
          >
            <Icon as={Lightbulb} />
          </div>
        </div>

        {/* Heading */}
        <div
          data-testid="tip-preview-heading"
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--navy-text, #25324f)',
            marginBottom: 4,
          }}
        >
          Conseil du jour
        </div>

        {/* Body Text */}
        <div
          data-testid="tip-preview-body"
          style={{
            fontSize: 13,
            lineHeight: 1.45,
            color: 'var(--ink2)',
            minHeight: 38,
            wordBreak: 'break-word',
          }}
        >
          {text.trim() || (
            <span style={{ color: 'var(--muted, #6b7280)', fontStyle: 'italic' }}>
              Le texte du conseil apparaîtra ici dans l&apos;application mobile…
            </span>
          )}
        </div>

        {/* Image Thumbnail */}
        {cleanImage && (
          <div
            style={{
              marginTop: 10,
              borderRadius: 10,
              overflow: 'hidden',
              border: '1px solid var(--line)',
              backgroundColor: 'var(--paper)',
            }}
          >
            <img
              src={cleanImage}
              alt="Illustration du conseil"
              data-testid="tip-preview-image"
              style={{
                width: '100%',
                maxHeight: 140,
                objectFit: 'cover',
                display: 'block',
              }}
            />
          </div>
        )}

        {/* Action Link CTA */}
        {cleanLink && (
          <div style={{ marginTop: 12 }}>
            <a
              href={cleanLink}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="tip-preview-cta"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 600,
                color: '#ffffff',
                backgroundColor: 'var(--navy, #25324f)',
                borderRadius: 8,
                textDecoration: 'none',
                boxShadow: '0 2px 4px rgba(37, 50, 79, 0.2)',
              }}
            >
              <span>En savoir plus</span>
              <span aria-hidden="true">→</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
