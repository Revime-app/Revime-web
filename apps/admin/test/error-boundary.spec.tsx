import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

// The boundaries are client components that run an effect; calling them directly (to reach
// the button's onClick) needs the hook stubbed, and the stub also lets us read the effect.
const effects: Array<() => void> = [];
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useEffect: (fn: () => void) => void effects.push(fn) };
});

import ErrorBoundary from '../app/error';
import GlobalError from '../app/global-error';

function findAll(node: React.ReactNode, type: string, out: React.ReactElement[] = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((n) => findAll(n, type, out));
    return out;
  }
  const el = node as React.ReactElement<{ children?: React.ReactNode }>;
  if (el.type === type) out.push(el);
  findAll(el.props?.children, type, out);
  return out;
}

const withDigest = Object.assign(new Error('x.map is not a function'), { digest: '12345678' });

describe.each([
  ['app/error.tsx', ErrorBoundary, 'Retour au tableau de bord'],
  ['app/global-error.tsx', GlobalError, null],
] as const)('Admin %s', (_name, Boundary, backLabel) => {
  beforeEach(() => {
    effects.length = 0;
  });

  it('renders the localized French message with a retry button', () => {
    const html = renderToString(<Boundary error={withDigest} reset={vi.fn()} />);
    expect(html).toContain('Une erreur inattendue est survenue');
    expect(html).toContain('Réessayer');
    if (backLabel) expect(html).toContain(backLabel);
  });

  it('never shows the raw technical message to the person using the page', () => {
    const html = renderToString(<Boundary error={withDigest} reset={vi.fn()} />);
    expect(html).not.toContain('x.map is not a function');
  });

  it('shows the digest as a reference the operator can quote, only when there is one', () => {
    expect(renderToString(<Boundary error={withDigest} reset={vi.fn()} />)).toContain('12345678');
    expect(renderToString(<Boundary error={new Error('boom')} reset={vi.fn()} />)).not.toContain(
      'Référence'
    );
  });

  it('calls reset when the retry button is pressed', () => {
    const reset = vi.fn();
    const tree = (Boundary as (p: { error: Error; reset: () => void }) => React.ReactElement)({
      error: withDigest,
      reset,
    });
    const retry = findAll(tree, 'button').find((b) => /Réessayer/.test(JSON.stringify(b.props)));
    expect(retry).toBeDefined();
    (retry!.props as { onClick: () => void }).onClick();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('logs the error once so an operator can find it in the browser console', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    (Boundary as (p: { error: Error; reset: () => void }) => React.ReactElement)({
      error: withDigest,
      reset: vi.fn(),
    });
    expect(effects).toHaveLength(1);
    effects[0]!();
    expect(spy).toHaveBeenCalledWith(expect.any(String), withDigest);
    spy.mockRestore();
  });
});
