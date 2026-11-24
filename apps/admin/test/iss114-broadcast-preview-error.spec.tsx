import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import NotificationsPage, { computeTargetSummary } from '../app/notifications/page';
import { loadAudiencePreview, previewFailureMessage, sendBlocker } from '../lib/broadcast-audience';

const ready = {
  hasChannel: true,
  subjectValid: true,
  bodyValid: true,
  targetValid: true,
  sending: false,
  previewError: null,
};

describe('ISS-114: a failed audience preview is shown and blocks the send', () => {
  it('lets a complete message go when the preview worked', () => {
    expect(sendBlocker(ready)).toBeNull();
  });

  it('blocks a complete message when the preview failed, and says why', () => {
    expect(sendBlocker({ ...ready, previewError: 'Aperçu indisponible.' })).toBe('Aperçu indisponible.');
  });

  it('still reports the composer faults before the preview fault', () => {
    expect(sendBlocker({ ...ready, hasChannel: false, previewError: 'x' })).toBe(
      'Sélectionnez au moins un canal de diffusion.',
    );
  });

  it('never sends twice', () => {
    expect(sendBlocker({ ...ready, sending: true })).not.toBeNull();
  });

  it('uses the API message when the preview is refused', () => {
    expect(previewFailureMessage(400, { message: 'Identifiant invalide.' })).toBe('Identifiant invalide.');
  });

  it('falls back to a plain sentence when the API gives none, or the call never answered', () => {
    expect(previewFailureMessage(500, null)).toMatch(/aperçu/i);
    expect(previewFailureMessage(null, null)).toMatch(/aperçu/i);
  });

  it('renders the preview error on the page', () => {
    const html = renderToString(<NotificationsPage initialPreviewError="Aperçu indisponible : réessayez." />);
    expect(html).toContain('Aperçu indisponible : réessayez.');
  });
});

describe('ISS-114: nothing in the audience selector asks for a UUID', () => {
  it('labels the single-recipient mode without the word UUID', () => {
    const html = renderToString(<NotificationsPage />);
    expect(html).not.toContain('(UUID)');
  });

  it('summarises an unset single recipient without the word UUID', () => {
    expect(computeTargetSummary({ type: 'INDIVIDUAL', userId: '' })).not.toContain('UUID');
  });
});

describe('ISS-114: loadAudiencePreview', () => {
  const target = { type: 'INDIVIDUAL', userId: 'e2xRd3VFq9ZkT1mNpLw8YbHc4sJaUo6G' } as const;
  const okBody = { totalRecipients: 1 };

  it('returns the preview when the API answers', async () => {
    const fetchFn = async () => new Response(JSON.stringify(okBody), { status: 200 });
    expect(await loadAudiencePreview(fetchFn as typeof fetch, target)).toEqual({ preview: okBody, error: null });
  });

  it('returns the API message when the API refuses the target', async () => {
    const fetchFn = async () => new Response(JSON.stringify({ message: 'Identifiant invalide.' }), { status: 400 });
    expect(await loadAudiencePreview(fetchFn as typeof fetch, target)).toEqual({
      preview: null,
      error: 'Identifiant invalide.',
    });
  });

  it('returns a plain error when the body is not JSON', async () => {
    const fetchFn = async () => new Response('<html>', { status: 502 });
    const r = await loadAudiencePreview(fetchFn as typeof fetch, target);
    expect(r.preview).toBeNull();
    expect(r.error).toContain('502');
  });

  it('returns a plain error when the request never answers', async () => {
    const fetchFn = async () => {
      throw new TypeError('network');
    };
    const r = await loadAudiencePreview(fetchFn as unknown as typeof fetch, target);
    expect(r.preview).toBeNull();
    expect(r.error).toMatch(/aperçu/i);
  });
});
