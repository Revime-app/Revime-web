import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { HideReviewModal } from '../app/avis/HideReviewModal';
import { ReviewDetailDrawer } from '../app/avis/ReviewDetailDrawer';
import { BusinessDecisionModal } from '../app/verifications/BusinessDecisionModal';
import { IdentityDecisionModal } from '../app/verifications/IdentityDecisionModal';

// RU-13 review of B9. `--ink` is #141414 in the light theme and #f8fafc in the dark one, so a surface painted
// with the literal #fff under text coloured `--ink` is white on white in the dark theme: the very defect B9
// removed, back for anyone on the dark theme. A surface under `--ink` text must use `--paper`, which flips with it.
const noop = vi.fn();

const surfaces: Array<[string, () => string]> = [
  ['the review drawer', () => renderToString(<ReviewDetailDrawer reviewId="rev-1" onClose={noop} onChanged={noop} />)],
  ['the hide-review modal', () => renderToString(<HideReviewModal reviewId="rev-1" onClose={noop} onHidden={noop} />)],
  [
    'the identity refusal modal',
    () => renderToString(<IdentityDecisionModal userId="u1" kind="refuse" onClose={noop} onDone={noop} onConflict={noop} />),
  ],
  [
    'the business refusal modal',
    () => renderToString(<BusinessDecisionModal userId="u1" kind="refuse" onClose={noop} onDone={noop} onConflict={noop} />),
  ],
];

describe('B9: surfaces and buttons stay readable in the dark theme', () => {
  it.each(surfaces)('%s paints no literal white surface', (_name, render) => {
    expect(render()).not.toMatch(/background(-color)?:#fff(fff)?(?![0-9a-f])/i);
  });

  it.each(surfaces.slice(1))('%s gives its "Annuler" button a surface and a text colour that flip together', (_name, render) => {
    const html = render();
    const cancel = html.match(/<button[^>]*>Annuler<\/button>/);
    expect(cancel).not.toBeNull();
    expect(cancel![0]).toContain('background-color:var(--paper');
    expect(cancel![0]).toContain('color:var(--ink');
  });
});
