import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  DisputeEvidencePhotosGallery,
  DisputePhotoPreviewModal,
} from '../app/litiges/DisputeDossierDrawer';

describe('Bug B8: Dispute evidence photo rendering and full-size preview', () => {
  const samplePhotos = [
    'https://supabase.example.com/storage/v1/object/sign/photos/commandes/cmd-1/litige/client/broken-screen.jpg?token=abc',
    'https://supabase.example.com/storage/v1/object/sign/photos/commandes/cmd-1/litige/client/receipt.png?token=xyz',
  ];

  describe('DisputeEvidencePhotosGallery', () => {
    it('renders all evidence photo thumbnails with signed URLs', () => {
      const html = renderToString(
        <DisputeEvidencePhotosGallery
          photos={samplePhotos}
          onPreviewPhoto={vi.fn()}
        />,
      );

      expect(html).toContain('Photos jointes au litige (2)');
      expect(html).toContain(samplePhotos[0]);
      expect(html).toContain(samplePhotos[1]);
      expect(html).toContain('Pièce jointe litige 1');
      expect(html).toContain('Pièce jointe litige 2');
      expect(html).toContain('data-testid="evidence-photo-0"');
      expect(html).toContain('data-testid="evidence-photo-1"');
    });

    it('renders empty when photos array is empty', () => {
      const html = renderToString(
        <DisputeEvidencePhotosGallery
          photos={[]}
          onPreviewPhoto={vi.fn()}
        />,
      );
      expect(html).toBe('');
    });
  });

  describe('DisputePhotoPreviewModal', () => {
    it('renders full-size image modal with signed photo and close button', () => {
      const html = renderToString(
        <DisputePhotoPreviewModal
          photo={samplePhotos[0]}
          onClose={vi.fn()}
        />,
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain(samplePhotos[0]);
      expect(html).toContain('Aperçu photo');
      expect(html).toContain('aria-label="Fermer l&#x27;aperçu"');
      expect(html).toContain('data-testid="close-photo-preview"');
    });

    it('renders nothing when photo is null', () => {
      const html = renderToString(
        <DisputePhotoPreviewModal
          photo={null}
          onClose={vi.fn()}
        />,
      );
      expect(html).toBe('');
    });
  });
});
