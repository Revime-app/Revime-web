import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { CopyableReference } from '../components/CopyableReference';

describe('CopyableReference smart linking', () => {
  it('automatically generates /commandes/:id link when prefix is CMD and href is omitted', () => {
    const html = renderToString(
      <CopyableReference value="2c53de51-b157-430a-9d90-349f481a539b" prefix="CMD" />
    );
    expect(html).toContain('href="/commandes/2c53de51-b157-430a-9d90-349f481a539b"');
    expect(html).toContain('CMD-2C53DE51');
  });

  it('respects explicitly provided custom href', () => {
    const html = renderToString(
      <CopyableReference value="2c53de51" prefix="CMD" href="/custom/path" />
    );
    expect(html).toContain('href="/custom/path"');
  });

  it('does not generate link for non-CMD prefix when href is omitted', () => {
    const html = renderToString(
      <CopyableReference value="USR-123" prefix="USR" />
    );
    expect(html).not.toContain('<a');
    expect(html).not.toContain('href=');
  });

  it('automatically generates /commandes/:id link when prefix defaults to CMD', () => {
    const html = renderToString(
      <CopyableReference value="2c53de51-b157-430a-9d90-349f481a539b" />
    );
    expect(html).toContain('href="/commandes/2c53de51-b157-430a-9d90-349f481a539b"');
  });
});
