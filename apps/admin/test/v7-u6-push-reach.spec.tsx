import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminBroadcastPreview } from '@revime/shared';
import { pushReach, pushReachWarning } from '../lib/broadcast-audience';
import { BroadcastPreviewCard } from '../components/BroadcastPreviewCard';

/**
 * V7 D1 (U6). « afficher le nombre de destinataires réellement joignables en push »: the client's
 * push broadcasts of 2026-10-27 reached 0 people and the page only had a small « 0 avec push actif
 * et accord marketing » line, with no reason for the zero.
 */
const preview = (over: Partial<AdminBroadcastPreview> = {}): AdminBroadcastPreview => ({
  totalRecipients: 3099,
  emailEligibleCount: 3099,
  pushEligibleCount: 4,
  marketingEmailCount: 0,
  marketingPushCount: 0,
  pushIosCount: 4,
  pushAndroidCount: 0,
  marketingPushIosCount: 0,
  marketingPushAndroidCount: 0,
  sampleRecipients: [],
  ...over,
});

describe('pushReach (V7 D1)', () => {
  it('on a commercial send, counts only the consenting device holders, and says why the others are out', () => {
    expect(pushReach(preview(), true)).toEqual({
      reachable: 0,
      ios: 0,
      android: 0,
      noDevice: 3095,
      noConsent: 4,
    });
  });

  it('on a service message, counts every device holder and has no consent gap', () => {
    expect(pushReach(preview(), false)).toEqual({ reachable: 4, ios: 4, android: 0, noDevice: 3095, noConsent: null });
  });

  it('is all zeros before the preview arrives', () => {
    expect(pushReach(null, true)).toEqual({ reachable: 0, ios: 0, android: 0, noDevice: 0, noConsent: null });
  });
});

describe('pushReachWarning (V7 D1)', () => {
  it('warns when push is ticked and nobody has the notifications on', () => {
    const w = pushReachWarning(preview({ pushEligibleCount: 0, pushIosCount: 0 }), false, true);
    expect(w).toMatch(/aucun téléphone/);
    expect(w).toMatch(/notifications/);
  });

  it('names the missing consent when device holders exist but none consented', () => {
    const w = pushReachWarning(preview(), true, true);
    expect(w).toMatch(/aucun téléphone/);
    expect(w).toMatch(/4 membre\(s\)/);
    expect(w).toMatch(/communications commerciales/);
  });

  it('says nothing when push is not ticked, when someone is reachable, or before the preview', () => {
    expect(pushReachWarning(preview(), true, false)).toBeNull();
    expect(pushReachWarning(preview(), false, true)).toBeNull();
    expect(pushReachWarning(null, true, true)).toBeNull();
  });
});

describe('BroadcastPreviewCard push reach (V7 D1)', () => {
  const render = (restricted: boolean, push = true) =>
    renderToString(
      <BroadcastPreviewCard
        preview={preview()}
        subject="Objet"
        body="Corps du message"
        channels={{ email: true, push }}
        consentRestricted={restricted}
      />,
    );

  it('shows « Joignables en push », the platform split and both gaps', () => {
    const html = render(true);
    expect(html).toContain('Joignables en push');
    expect(html).toMatch(/iOS\s*(<!-- -->)?\s*0/);
    expect(html).toMatch(/Android\s*(<!-- -->)?\s*0/);
    expect(html).toContain('sans l&#x27;application ou avec les notifications désactivées');
    expect(html).toContain('accepté les communications commerciales');
  });

  it('shows the zero-reach warning when push is ticked', () => {
    expect(render(true)).toContain('aucun téléphone');
    expect(render(true, false)).not.toContain('aucun téléphone');
  });

  // V7 ISS7-038: production read « 3095sans l'application… ». The source had the space, but Next's
  // compiler emitted `[noDevice, "sans l'application…"]` without it (the text held `&apos;`).
  // One text node keeps the space whatever the JSX whitespace rules do.
  it('keeps the space between the no-device count and its sentence', () => {
    expect(render(true)).toContain('3095 sans l&#x27;application ou avec les notifications désactivées');
  });

  it('says « 1 destinataire » in the singular, and the plural from 2', () => {
    const at = (n: number) =>
      renderToString(
        <BroadcastPreviewCard
          preview={preview({ totalRecipients: n, emailEligibleCount: n, pushEligibleCount: 0, pushIosCount: 0 })}
          subject="Objet"
          body="Corps"
          channels={{ email: true, push: false }}
          consentRestricted={false}
        />,
      );
    expect(at(1)).toContain('1 destinataire<');
    expect(at(1)).not.toContain('1 destinataires');
    expect(at(2)).toContain('2 destinataires<');
  });
});
