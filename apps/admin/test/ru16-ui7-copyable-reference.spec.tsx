import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

const setState = vi.fn();
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: (initial: unknown) => [initial, setState] };
});

import { CopyableReference } from '../components/CopyableReference';

function findButton(node: React.ReactNode): React.ReactElement<{ onClick: (e: unknown) => Promise<void> }> | null {
  if (!React.isValidElement(node)) return null;
  const el = node as React.ReactElement<{ children?: React.ReactNode; onClick: (e: unknown) => Promise<void> }>;
  if (el.type === 'button') return el;
  for (const child of React.Children.toArray(el.props.children)) {
    const found = findButton(child);
    if (found) return found;
  }
  return null;
}

describe('RU-16 UI7: the copy button of a short reference', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    setState.mockReset();
  });

  it('is a sibling of the link, never nested inside the anchor', () => {
    const html = renderToString(<CopyableReference value="2c53de51-b157-430a-9d90-349f481a539b" />);
    const anchorEnd = html.indexOf('</a>');
    expect(anchorEnd).toBeGreaterThan(0);
    expect(html.indexOf('<button')).toBeGreaterThan(anchorEnd);
    expect(html).toContain('role="status"');
  });

  it('tells the operator when the browser cannot copy (no clipboard outside a secure context)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', {});
    const button = findButton(CopyableReference({ value: 'abcdef12-0000-0000-0000-000000000000', href: '/x' }));
    await button!.props.onClick({ stopPropagation: vi.fn(), preventDefault: vi.fn() });
    expect(setState).toHaveBeenCalledWith('failed');
    expect(setState).not.toHaveBeenCalledWith('copied');
  });

  it('confirms a successful copy and writes the short reference, not the raw id', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const button = findButton(CopyableReference({ value: 'abcdef12-0000-0000-0000-000000000000' }));
    await button!.props.onClick({ stopPropagation: vi.fn(), preventDefault: vi.fn() });
    expect(writeText).toHaveBeenCalledWith('CMD-ABCDEF12');
    expect(setState).toHaveBeenCalledWith('copied');
  });
});
