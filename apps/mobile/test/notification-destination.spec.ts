import { describe, expect, it } from 'vitest';
import { destinationFor } from '../src/lib/notification-destination.js';

describe('destinationFor (DEMANDE_WITHDRAWN)', () => {
  it('routes to conversation when conversationId is present (CF6-12)', () => {
    expect(
      destinationFor({
        type: 'DEMANDE_WITHDRAWN',
        conversationId: 'conv-123',
        demandeId: 'dem-456',
        commandeId: null,
      }),
    ).toBe('/conversation/conv-123');
  });

  it('returns null when conversationId is null (public soft-deleted demande)', () => {
    expect(
      destinationFor({
        type: 'DEMANDE_WITHDRAWN',
        conversationId: null,
        demandeId: 'dem-456',
        commandeId: null,
      }),
    ).toBeNull();
  });
});

describe('destinationFor (SETUP_REMINDER, V8 E1)', () => {
  it('opens the setup page, even when the 8-day reminder names a request', () => {
    expect(
      destinationFor({ type: 'SETUP_REMINDER', conversationId: null, demandeId: 'dem-1', commandeId: null }),
    ).toBe('/statut-verification');
    expect(
      destinationFor({ type: 'SETUP_REMINDER', conversationId: null, demandeId: null, commandeId: null }),
    ).toBe('/statut-verification');
  });
});
