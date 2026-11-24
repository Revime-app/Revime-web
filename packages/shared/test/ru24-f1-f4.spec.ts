import { describe, it, expect } from 'vitest';
import { ADMIN_AUDIT_ACTIONS } from '../src/admin.schemas.js';
import { ADMIN_AUDIT_DOMAINS, getDomainForAction } from '../src/admin-audit.schemas.js';
import { promoCodeCreateSchema } from '../src/promo.schemas.js';
import {
  adminBroadcastSendSchema,
  segmentLocationNeedsRepairers,
} from '../src/communication.schemas.js';

describe('RU-24 · F4 audit taxonomy is total over the action enum', () => {
  const listed = Object.values(ADMIN_AUDIT_DOMAINS).flatMap((d) => d.actions as string[]);

  it('puts every audit action in a domain', () => {
    const missing = ADMIN_AUDIT_ACTIONS.filter((a) => !listed.includes(a));
    // An action in no domain reads as a security event (getDomainForAction's fallback).
    expect(missing).toEqual([]);
  });

  it('puts every audit action in exactly one domain', () => {
    const twice = ADMIN_AUDIT_ACTIONS.filter((a) => listed.filter((l) => l === a).length > 1);
    expect(twice).toEqual([]);
  });

  it('lists no string the action enum does not know', () => {
    const known = new Set<string>(ADMIN_AUDIT_ACTIONS);
    expect(listed.filter((l) => !known.has(l))).toEqual([]);
  });

  it('files the F2 and F3 writes under Marketing, a payout retry under Commandes', () => {
    expect(getDomainForAction('promo.create')).toBe('MARKETING_PROMOS');
    expect(getDomainForAction('promo.update_status')).toBe('MARKETING_PROMOS');
    expect(getDomainForAction('broadcast.send')).toBe('MARKETING_PROMOS');
    expect(getDomainForAction('payout.transfer_retry')).toBe('COMMANDES');
    expect(getDomainForAction('cancellation.approve')).toBe('COMMANDES');
    expect(getDomainForAction('review.hide')).toBe('CATALOGUE_CONTENU');
  });
});

describe('RU-24 · F3 a promo percentage is at most 100', () => {
  const base = { code: 'ETE10', type: 'PERCENTAGE' as const, valueCents: 10 };

  it('accepts 100 % and refuses 150 %', () => {
    expect(promoCodeCreateSchema.safeParse({ ...base, valueCents: 100 }).success).toBe(true);
    const r = promoCodeCreateSchema.safeParse({ ...base, valueCents: 150 });
    expect(r.success).toBe(false);
  });

  it('does not cap a fixed amount at 100 (it is in cents)', () => {
    expect(
      promoCodeCreateSchema.safeParse({ code: 'ETE10', type: 'FIXED_AMOUNT', valueCents: 1500 }).success,
    ).toBe(true);
  });

  it('refuses a cap on a fixed amount', () => {
    expect(
      promoCodeCreateSchema.safeParse({
        code: 'ETE10',
        type: 'FIXED_AMOUNT',
        valueCents: 1500,
        maxDiscountCents: 500,
      }).success,
    ).toBe(false);
  });

  it('refuses an end date that does not follow the start date', () => {
    const r = promoCodeCreateSchema.safeParse({
      ...base,
      startsAt: '2026-11-10T00:00:00.000Z',
      expiresAt: '2026-11-01T00:00:00.000Z',
    });
    expect(r.success).toBe(false);
  });
});

describe('RU-24 · F2 a city or department only reaches réparateurs', () => {
  const channels = { email: true, push: false };
  const text = { subject: 'Bonjour à tous', body: 'Un message suffisamment long.' };

  it('flags a client or all-users segment with a city', () => {
    expect(
      segmentLocationNeedsRepairers({ type: 'SEGMENT', role: 'CLIENT', city: 'Lyon', verifiedOnly: false, activeOnly: true }),
    ).toBe(true);
    expect(
      segmentLocationNeedsRepairers({ type: 'SEGMENT', role: 'ALL', department: '69', verifiedOnly: false, activeOnly: true }),
    ).toBe(true);
  });

  it('lets « tous les réparateurs de Lyon » through, and a whole-role segment', () => {
    expect(
      segmentLocationNeedsRepairers({ type: 'SEGMENT', role: 'REPAIRER', city: 'Lyon', verifiedOnly: false, activeOnly: true }),
    ).toBe(false);
    expect(
      segmentLocationNeedsRepairers({ type: 'SEGMENT', role: 'CLIENT', verifiedOnly: false, activeOnly: true }),
    ).toBe(false);
  });

  it('refuses the send schema for clients in Lyon', () => {
    const bad = adminBroadcastSendSchema.safeParse({
      target: { type: 'SEGMENT', role: 'CLIENT', city: 'Lyon' },
      channels,
      ...text,
    });
    expect(bad.success).toBe(false);
    const ok = adminBroadcastSendSchema.safeParse({
      target: { type: 'SEGMENT', role: 'REPAIRER', city: 'Lyon' },
      channels,
      ...text,
    });
    expect(ok.success).toBe(true);
  });
});
