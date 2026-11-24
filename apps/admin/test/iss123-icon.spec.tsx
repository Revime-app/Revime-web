import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Package } from 'lucide-react';
import { Icon } from '../components/Icon';

// ISS-123: one wrapper so every replaced emoji has the same size, stroke and alignment.
describe('Icon', () => {
  it('renders the given Lucide component as an inline SVG that inherits the text size', () => {
    const html = renderToString(<Icon as={Package} />);
    expect(html).toContain('<svg');
    expect(html).toContain('lucide-package');
    expect(html).toContain('width="1em"');
    expect(html).toContain('height="1em"');
  });

  it('is decorative by default so screen readers do not read it', () => {
    expect(renderToString(<Icon as={Package} />)).toContain('aria-hidden="true"');
  });

  it('keeps a label when one is given, and drops aria-hidden then', () => {
    const html = renderToString(<Icon as={Package} label="Colis" />);
    expect(html).toContain('aria-label="Colis"');
    expect(html).toContain('role="img"');
    expect(html).not.toContain('aria-hidden');
  });

  it('sits on the text baseline and never shrinks inside a flex row', () => {
    const html = renderToString(<Icon as={Package} />);
    expect(html).toContain('vertical-align:-0.125em');
    expect(html).toContain('flex-shrink:0');
  });

  it('lets a caller set the size', () => {
    expect(renderToString(<Icon as={Package} size={32} />)).toContain('width="32"');
  });
});
