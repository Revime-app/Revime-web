import { describe, expect, it } from 'vitest';
import { type OfferBlockInput, offerBlock } from '../src/index.js';

/**
 * V8 E1, `DEC8-08` (6): why the app would stop a repairer at « Faire une offre », in the server's own order
 * (`OffersService.create`: e-mail/phone, then identity, BUSINESS for a PRO). `null` means the server says yes.
 */
function input(over: Partial<OfferBlockInput>): OfferBlockInput {
  return {
    level: 'BASIC',
    kind: 'INDIVIDUAL',
    identityStatus: null,
    lastErrorCode: null,
    identityDecision: null,
    businessStatus: null,
    basicRequired: true,
    identityRequired: true,
    ...over,
  };
}

describe('V8 E1 offerBlock', () => {
  it('NONE with the basic gate on is BASIC, before anything else', () => {
    expect(offerBlock(input({ level: 'NONE' }))).toBe('BASIC');
    expect(offerBlock(input({ level: 'NONE', kind: 'PRO' }))).toBe('BASIC');
  });

  it('NONE with the basic gate off falls through to identity', () => {
    expect(offerBlock(input({ level: 'NONE', basicRequired: false }))).toBe('IDENTITY');
  });

  it('BASIC with nothing started is IDENTITY', () => {
    expect(offerBlock(input({}))).toBe('IDENTITY');
  });

  it('an identity session under review is IDENTITY_PENDING', () => {
    expect(offerBlock(input({ identityStatus: 'PROCESSING' }))).toBe('IDENTITY_PENDING');
  });

  it('verified session with a lagging level is IDENTITY_PENDING', () => {
    expect(offerBlock(input({ identityStatus: 'VERIFIED' }))).toBe('IDENTITY_PENDING');
  });

  it('a verified session an operator refused is IDENTITY, not pending', () => {
    expect(offerBlock(input({ identityStatus: 'VERIFIED', identityDecision: 'REFUSED' }))).toBe('IDENTITY');
  });

  it('INDIVIDUAL at IDENTITY or BUSINESS passes', () => {
    expect(offerBlock(input({ level: 'IDENTITY' }))).toBeNull();
    expect(offerBlock(input({ level: 'BUSINESS' }))).toBeNull();
  });

  it('PRO at IDENTITY is a business block, by business status', () => {
    expect(offerBlock(input({ level: 'IDENTITY', kind: 'PRO' }))).toBe('BUSINESS');
    expect(offerBlock(input({ level: 'IDENTITY', kind: 'PRO', businessStatus: 'PENDING' }))).toBe('BUSINESS_PENDING');
    expect(offerBlock(input({ level: 'IDENTITY', kind: 'PRO', businessStatus: 'REJECTED' }))).toBe('BUSINESS_REDO');
    expect(offerBlock(input({ level: 'IDENTITY', kind: 'PRO', businessStatus: 'DOCUMENTS_REQUIRED' }))).toBe(
      'BUSINESS_REDO',
    );
  });

  it('PRO below IDENTITY is told about identity first', () => {
    expect(offerBlock(input({ kind: 'PRO' }))).toBe('IDENTITY');
  });

  it('PRO at BUSINESS is null', () => {
    expect(offerBlock(input({ level: 'BUSINESS', kind: 'PRO' }))).toBeNull();
  });

  it('with the identity gate off, nothing past BASIC blocks', () => {
    expect(offerBlock(input({ identityRequired: false }))).toBeNull();
    expect(offerBlock(input({ level: 'IDENTITY', kind: 'PRO', identityRequired: false }))).toBeNull();
  });
});
