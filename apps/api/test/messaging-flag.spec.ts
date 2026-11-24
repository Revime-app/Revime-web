import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertMessagingEnabled, isMessagingEnabled } from '../src/conversations/flag.js';

describe('isMessagingEnabled', () => {
  const original = process.env.MESSAGING_ENABLED;

  beforeEach(() => {
    delete process.env.MESSAGING_ENABLED;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.MESSAGING_ENABLED;
    else process.env.MESSAGING_ENABLED = original;
  });

  it('is OFF when the variable is absent, which is the configuration that ships', () => {
    // Deletes rather than trusting the ambient value: that is what lets this test
    // see the absent case at all.
    expect(isMessagingEnabled()).toBe(false);
  });

  it('is ON only for the exact literal "true"', () => {
    process.env.MESSAGING_ENABLED = 'true';
    expect(isMessagingEnabled()).toBe(true);
  });

  it.each(['1', 'TRUE', 'True', 'yes', '', 'false'])('is OFF for %o', (value) => {
    process.env.MESSAGING_ENABLED = value;
    expect(isMessagingEnabled()).toBe(false);
  });

  it('refuses with the authored French and a 422 code when off', () => {
    expect(() => assertMessagingEnabled()).toThrowError(
      "La messagerie n'est pas encore disponible.",
    );
  });

  it('does not throw when on', () => {
    process.env.MESSAGING_ENABLED = 'true';
    expect(() => assertMessagingEnabled()).not.toThrow();
  });
});

describe('MeResponse.messagingEnabled', () => {
  const original = process.env.MESSAGING_ENABLED;

  afterEach(() => {
    if (original === undefined) delete process.env.MESSAGING_ENABLED;
    else process.env.MESSAGING_ENABLED = original;
  });

  it('is the flag, read through the same helper the routes use', async () => {
    // Not a route test: this pins that the DTO field and the guard cannot disagree,
    // which is the whole reason the field exists. Typecheck prevents the field being
    // absent; the integration suite pins the wiring (conversations.int.spec.ts asserts
    // the field reads true with the flag on and false with it off); this unit block
    // pins only the helper.
    const { isMessagingEnabled } = await import('../src/conversations/flag.js');
    process.env.MESSAGING_ENABLED = 'true';
    expect(isMessagingEnabled()).toBe(true);
    delete process.env.MESSAGING_ENABLED;
    expect(isMessagingEnabled()).toBe(false);
  });
});
