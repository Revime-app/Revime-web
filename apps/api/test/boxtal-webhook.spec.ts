import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FakeShippingGateway, verifyBoxtalSignature } from '../src/shipping/gateway.js';

const SECRET = 'kat-secret';
const raw = readFileSync(new URL('./fixtures/boxtal/webhook-document-created.json', import.meta.url));
const manifest = JSON.parse(
  readFileSync(new URL('./fixtures/boxtal/webhook-fixtures.json', import.meta.url), 'utf8'),
) as { secret: string; fixtures: { file: string; type: string; shippingOrderId: string; 'x-bxt-signature': string }[] };

describe('verifyBoxtalSignature', () => {
  it('known answer from Boxtal itself: the captured x-bxt-signature verifies the captured raw body with the sandbox secret', () => {
    // Two real deliveries from the 2026-09-04 sandbox probe, byte-for-byte, with the header
    // Boxtal sent. This is the test that pins the encoding to what the vendor does, not to
    // what we assume.
    for (const f of manifest.fixtures) {
      const body = readFileSync(new URL(`./fixtures/boxtal/${f.file}`, import.meta.url));
      const event = verifyBoxtalSignature(body, f['x-bxt-signature'], manifest.secret);
      expect(event, f.file).not.toBeNull();
      expect(event?.type).toBe(f.type);
      expect(event?.shippingOrderId).toBe(f.shippingOrderId);
    }
  });

  it('accepts the hex HMAC-SHA256 of the raw body and parses the event', () => {
    const sig = createHmac('sha256', SECRET).update(raw).digest('hex');
    const event = verifyBoxtalSignature(raw, sig, SECRET);
    expect(event?.type).toBe('DOCUMENT_CREATED');
    expect(event?.shippingOrderId.length).toBeGreaterThan(0);
    expect(event?.shipmentExternalId).toMatch(/^probe-/);
    expect(event?.payload.documents?.[0]?.type).toBe('LABEL');
  });

  it('REFUSES the base64 form: the probe established hex (spec « Amendment, 2026-09-04 », item d)', () => {
    const sig = createHmac('sha256', SECRET).update(raw).digest('base64');
    expect(verifyBoxtalSignature(raw, sig, SECRET)).toBeNull();
  });

  it('accepts uppercase hex, since a hex digest is case-insensitive by definition', () => {
    const sig = createHmac('sha256', SECRET).update(raw).digest('hex').toUpperCase();
    expect(verifyBoxtalSignature(raw, sig, SECRET)).not.toBeNull();
  });

  it('refuses a wrong secret, a tampered body, a missing header, an empty secret and a non-JSON body', () => {
    const sig = createHmac('sha256', SECRET).update(raw).digest('hex');
    expect(verifyBoxtalSignature(raw, sig, 'other')).toBeNull();
    expect(verifyBoxtalSignature(Buffer.concat([raw, Buffer.from(' ')]), sig, SECRET)).toBeNull();
    expect(verifyBoxtalSignature(raw, undefined, SECRET)).toBeNull();
    expect(verifyBoxtalSignature(raw, sig, '')).toBeNull();
    const notJson = Buffer.from('not json at all');
    const sig2 = createHmac('sha256', SECRET).update(notJson).digest('hex');
    expect(verifyBoxtalSignature(notJson, sig2, SECRET)).toBeNull();
  });

  it('the fake signs bodies its own verifyWebhook accepts', () => {
    const fake = new FakeShippingGateway();
    const { raw: body, signature } = fake.signedBody({
      id: 'event-1', type: 'TRACKING_CHANGED', shippingOrderId: 'o1', shipmentExternalId: 'ship1',
      payload: { trackings: [] },
    });
    expect(fake.verifyWebhook(body, signature)?.id).toBe('event-1');
    expect(fake.verifyWebhook(body, 'deadbeef')).toBeNull();
  });
});
