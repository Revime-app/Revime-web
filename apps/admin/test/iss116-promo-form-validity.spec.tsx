import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PromoCreateModal } from '../components/PromoCreateModal';

/** What a browser's constraint validation does with a number input (HTML « step mismatch »). */
function browserAccepts(html: string, id: string, value: string): boolean {
  const tag = (html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`)) ?? [''])[0];
  expect(tag, `input #${id} not rendered`).not.toBe('');
  const attr = (n: string) => (tag.match(new RegExp(`[ ]${n}="([^"]*)"`)) ?? [])[1];
  const min = attr('min');
  const step = attr('step');
  const v = Number(value);
  if (min !== undefined && v < Number(min)) return false;
  if (step === 'any') return true;
  const s = Number(step ?? '1');
  const base = min !== undefined ? Number(min) : 0;
  const steps = (v - base) / s;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

function html(): string {
  return renderToString(
    <PromoCreateModal isOpen onClose={() => {}} onCreate={async () => {}} />,
  );
}

describe('ISS-116: the promo form can be submitted', () => {
  it('accepts its own defaults', () => {
    const h = html();
    expect(browserAccepts(h, 'promo-value-input', '10')).toBe(true);
    expect(browserAccepts(h, 'promo-min-order-input', '0')).toBe(true);
    expect(browserAccepts(h, 'sim-basket-input', '50')).toBe(true);
  });

  it('accepts round and cent amounts in the discount value', () => {
    const h = html();
    for (const v of ['5', '10', '15', '12.5', '5.99', '0.01']) {
      expect(browserAccepts(h, 'promo-value-input', v), v).toBe(true);
    }
  });

  it('accepts cent amounts in the minimum order', () => {
    const h = html();
    for (const v of ['0', '12.5', '29.99']) {
      expect(browserAccepts(h, 'promo-min-order-input', v), v).toBe(true);
    }
  });

  it('never lets the test basket block the form, whatever is typed', () => {
    const h = html();
    for (const v of ['1', '37.5', '50', '49.99', '120']) {
      expect(browserAccepts(h, 'sim-basket-input', v), v).toBe(true);
    }
  });
});

describe('ISS-116: the other euro fields take cents too', () => {
  it('accepts a cent cap on the discount', () => {
    const h = html();
    for (const v of ['0.5', '25', '49.9']) {
      expect(browserAccepts(h, 'promo-max-discount-input', v), v).toBe(true);
    }
  });
});
