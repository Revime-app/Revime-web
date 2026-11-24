import { describe, expect, it } from 'vitest';
import {
  adminTipInputSchema,
  adminTipListQuerySchema,
  adminTipUpdateSchema,
  ADMIN_AUDIT_ACTION_LABEL,
  ADMIN_AUDIT_ACTIONS,
  parisDayIndex,
  parisDayStart,
  pickDailyTip,
  TIP_STATE_LABEL,
  tipState,
} from '@revime/shared';

/**
 * CF4-38 (spec L5, §4.2). The tip rules shared by `GET /tips/daily` and the admin list, so the
 * dashboard's « Aujourd'hui » line and the app cannot disagree. Pure functions: no Prisma.
 */

const NOW = new Date('2026-10-10T12:00:00.000Z');
const d = (iso: string) => new Date(iso);

describe('tipState', () => {
  it.each([
    ['inactive inside the window', { active: false, startsAt: d('2026-10-01T00:00Z'), endsAt: d('2026-10-20T00:00Z') }, 'DISABLED'],
    ['inactive with no window', { active: false, startsAt: null, endsAt: null }, 'DISABLED'],
    ['no window', { active: true, startsAt: null, endsAt: null }, 'ACTIVE'],
    ['before the window', { active: true, startsAt: d('2026-10-11T00:00Z'), endsAt: d('2026-10-20T00:00Z') }, 'SCHEDULED'],
    ['inside the window', { active: true, startsAt: d('2026-10-01T00:00Z'), endsAt: d('2026-10-20T00:00Z') }, 'ACTIVE'],
    ['after the window', { active: true, startsAt: d('2026-10-01T00:00Z'), endsAt: d('2026-10-05T00:00Z') }, 'EXPIRED'],
    ['open start, end ahead', { active: true, startsAt: null, endsAt: d('2026-10-20T00:00Z') }, 'ACTIVE'],
    ['open start, end passed', { active: true, startsAt: null, endsAt: d('2026-10-05T00:00Z') }, 'EXPIRED'],
    ['open end, start passed', { active: true, startsAt: d('2026-10-01T00:00Z'), endsAt: null }, 'ACTIVE'],
    ['open end, start ahead', { active: true, startsAt: d('2026-10-11T00:00Z'), endsAt: null }, 'SCHEDULED'],
    ['startsAt === now (inclusive)', { active: true, startsAt: NOW, endsAt: null }, 'ACTIVE'],
    ['endsAt === now (exclusive)', { active: true, startsAt: null, endsAt: NOW }, 'EXPIRED'],
  ] as const)('%s → %s', (_label, tip, expected) => {
    expect(tipState(tip, NOW)).toBe(expected);
  });

  it('accepts ISO strings as well as Dates', () => {
    expect(tipState({ active: true, startsAt: '2026-10-11T00:00:00.000Z', endsAt: null }, NOW)).toBe('SCHEDULED');
  });

  it('labels every state in French', () => {
    expect(TIP_STATE_LABEL).toEqual({
      ACTIVE: 'Actif',
      SCHEDULED: 'Programmé',
      EXPIRED: 'Expiré',
      DISABLED: 'Désactivé',
    });
  });
});

describe('parisDayIndex (Review Focus 1)', () => {
  it('summer (UTC+2): 21:59Z is still the same Paris day as 00:00Z, 22:00Z is the next', () => {
    expect(parisDayIndex(d('2026-07-15T21:59:00Z'))).toBe(parisDayIndex(d('2026-07-15T00:00:00Z')));
    expect(parisDayIndex(d('2026-07-15T22:00:00Z'))).toBe(parisDayIndex(d('2026-07-15T00:00:00Z')) + 1);
  });

  it('winter (UTC+1): 22:59Z is the same Paris day, 23:00Z flips', () => {
    expect(parisDayIndex(d('2026-01-15T22:59:00Z'))).toBe(parisDayIndex(d('2026-01-15T12:00:00Z')));
    expect(parisDayIndex(d('2026-01-15T23:00:00Z'))).toBe(parisDayIndex(d('2026-01-15T12:00:00Z')) + 1);
  });

  it('counts whole days since 1970-01-01 on the Paris calendar', () => {
    expect(parisDayIndex(d('1970-01-01T12:00:00Z'))).toBe(0);
    expect(parisDayIndex(d('2026-07-15T12:00:00Z'))).toBe(Date.UTC(2026, 6, 15) / 86_400_000);
  });
});

describe('parisDayStart', () => {
  it('is 00:00 Paris: UTC+2 before the October DST switch (Sun 25 Oct 2026), UTC+1 after', () => {
    expect(parisDayStart('2026-10-25').toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(parisDayStart('2026-10-26').toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect(parisDayStart('2026-10-31').toISOString()).toBe('2026-10-30T23:00:00.000Z');
    expect(parisDayStart('2026-11-01').toISOString()).toBe('2026-10-31T23:00:00.000Z');
  });

  it('is 00:00 Paris in March across the spring switch', () => {
    expect(parisDayStart('2026-03-29').toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(parisDayStart('2026-03-30').toISOString()).toBe('2026-03-29T22:00:00.000Z');
  });

  it('a tip ending « 31 oct. » (endsAt = start of 1 Nov) shows at 23:30 Paris on 31 Oct, not at 00:10 on 1 Nov', () => {
    const tip = { active: true, startsAt: null, endsAt: parisDayStart('2026-11-01') };
    expect(tipState(tip, d('2026-10-31T22:30:00Z'))).toBe('ACTIVE'); // 23:30 Paris (UTC+1)
    expect(tipState(tip, d('2026-10-31T23:10:00Z'))).toBe('EXPIRED'); // 00:10 Paris
    const summer = { active: true, startsAt: null, endsAt: parisDayStart('2026-08-01') };
    expect(tipState(summer, d('2026-07-31T21:30:00Z'))).toBe('ACTIVE'); // 23:30 Paris (UTC+2)
    expect(tipState(summer, d('2026-07-31T22:10:00Z'))).toBe('EXPIRED'); // 00:10 Paris
  });
});

type Row = {
  id: string;
  category: 'CLIENT' | 'REPAIRER' | 'ALL';
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
};

const row = (id: string, category: Row['category'], extra: Partial<Row> = {}): Row => ({
  id,
  category,
  active: true,
  startsAt: null,
  endsAt: null,
  createdAt: d(`2026-01-0${id.length % 9 + 1}T00:00:00Z`),
  ...extra,
});

describe('pickDailyTip', () => {
  const tips: Row[] = [
    row('c1', 'CLIENT', { createdAt: d('2026-01-01T00:00Z') }),
    row('r1', 'REPAIRER', { createdAt: d('2026-01-02T00:00Z') }),
    row('a1', 'ALL', { createdAt: d('2026-01-03T00:00Z') }),
    row('c2', 'CLIENT', { createdAt: d('2026-01-04T00:00Z'), startsAt: d('2027-01-01T00:00Z') }),
    row('c3', 'CLIENT', { createdAt: d('2026-01-05T00:00Z'), endsAt: d('2026-01-06T00:00Z') }),
    row('c4', 'CLIENT', { createdAt: d('2026-01-06T00:00Z'), active: false }),
  ];

  const candidatesOver = (pool: Row['category']) => {
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const got = pickDailyTip(tips, pool, new Date(NOW.getTime() + i * 86_400_000));
      if (got) seen.add(got.id);
    }
    return [...seen].sort();
  };

  it('CLIENT pool: CLIENT and ALL only, never scheduled / expired / disabled / other pool', () => {
    expect(candidatesOver('CLIENT')).toEqual(['a1', 'c1']);
  });

  it('REPAIRER pool: REPAIRER and ALL', () => {
    expect(candidatesOver('REPAIRER')).toEqual(['a1', 'r1']);
  });

  it('ALL pool: ALL tips only', () => {
    expect(candidatesOver('ALL')).toEqual(['a1']);
  });

  it('indexes the createdAt-then-id order with parisDayIndex(now) % n', () => {
    const idx = parisDayIndex(NOW) % 2;
    expect(pickDailyTip(tips, 'CLIENT', NOW)?.id).toBe(['c1', 'a1'][idx]);
  });

  it('breaks createdAt ties on id', () => {
    const same = d('2026-01-01T00:00Z');
    const tied = [row('b', 'CLIENT', { createdAt: same }), row('a', 'CLIENT', { createdAt: same })];
    const idx = parisDayIndex(NOW) % 2;
    expect(pickDailyTip(tied, 'CLIENT', NOW)?.id).toBe(['a', 'b'][idx]);
  });

  it('is stable under input reversal', () => {
    for (let i = 0; i < 10; i++) {
      const now = new Date(NOW.getTime() + i * 86_400_000);
      expect(pickDailyTip([...tips].reverse(), 'CLIENT', now)?.id).toBe(pickDailyTip(tips, 'CLIENT', now)?.id);
    }
  });

  it('flips at Paris midnight, not UTC midnight', () => {
    const two = [row('x', 'CLIENT', { createdAt: d('2026-01-01T00:00Z') }), row('y', 'CLIENT', { createdAt: d('2026-01-02T00:00Z') })];
    const before = pickDailyTip(two, 'CLIENT', d('2026-07-15T21:59:00Z'));
    const after = pickDailyTip(two, 'CLIENT', d('2026-07-15T22:00:00Z'));
    const utcMidnight = pickDailyTip(two, 'CLIENT', d('2026-07-16T00:00:00Z'));
    expect(after?.id).not.toBe(before?.id);
    expect(utcMidnight?.id).toBe(after?.id);
  });

  it('returns null when nothing is eligible', () => {
    expect(pickDailyTip([], 'CLIENT', NOW)).toBeNull();
    expect(pickDailyTip([row('z', 'CLIENT', { active: false })], 'CLIENT', NOW)).toBeNull();
  });
});

const firstMessage = (r: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }) =>
  r.error?.issues[0];

describe('adminTipInputSchema', () => {
  it('accepts a minimal tip, trims the text and defaults active to true', () => {
    const parsed = adminTipInputSchema.parse({ text: '  Nettoyez vos filtres.  ', category: 'CLIENT' });
    expect(parsed).toEqual({ text: 'Nettoyez vos filtres.', category: 'CLIENT', active: true, startsAt: null, endsAt: null });
  });

  it('accepts ISO dates or null', () => {
    const parsed = adminTipInputSchema.parse({
      text: 'x',
      category: 'ALL',
      startsAt: '2026-10-01T00:00:00.000Z',
      endsAt: null,
    });
    expect(parsed.startsAt).toBe('2026-10-01T00:00:00.000Z');
  });

  it('refuses an empty text « Le texte du conseil est requis. »', () => {
    const r = adminTipInputSchema.safeParse({ text: '   ', category: 'CLIENT' });
    expect(firstMessage(r)).toMatchObject({ message: 'Le texte du conseil est requis.', path: ['text'] });
  });

  it('refuses 281 chars « 280 caractères maximum. » and accepts 280', () => {
    const r = adminTipInputSchema.safeParse({ text: 'a'.repeat(281), category: 'CLIENT' });
    expect(firstMessage(r)).toMatchObject({ message: '280 caractères maximum.', path: ['text'] });
    expect(adminTipInputSchema.safeParse({ text: 'a'.repeat(280), category: 'CLIENT' }).success).toBe(true);
  });

  it('refuses an unknown category', () => {
    expect(adminTipInputSchema.safeParse({ text: 'x', category: 'OTHER' }).success).toBe(false);
  });

  it('refuses a non-ISO date', () => {
    expect(adminTipInputSchema.safeParse({ text: 'x', category: 'CLIENT', startsAt: 'demain' }).success).toBe(false);
  });

  it.each([
    ['equal', '2026-10-01T00:00:00.000Z'],
    ['before', '2026-09-30T00:00:00.000Z'],
  ])('refuses endsAt %s startsAt « La date de fin doit être après la date de début. » on endsAt', (_l, endsAt) => {
    const r = adminTipInputSchema.safeParse({ text: 'x', category: 'CLIENT', startsAt: '2026-10-01T00:00:00.000Z', endsAt });
    expect(firstMessage(r)).toMatchObject({ message: 'La date de fin doit être après la date de début.', path: ['endsAt'] });
  });
});

describe('adminTipUpdateSchema', () => {
  it('accepts a partial body and does not default missing fields', () => {
    expect(adminTipUpdateSchema.parse({ active: false })).toEqual({ active: false });
  });

  it('applies the same text rules', () => {
    const r = adminTipUpdateSchema.safeParse({ text: '' });
    expect(firstMessage(r)).toMatchObject({ message: 'Le texte du conseil est requis.' });
  });

  it('refines endsAt > startsAt when both are present', () => {
    const r = adminTipUpdateSchema.safeParse({ startsAt: '2026-10-02T00:00:00.000Z', endsAt: '2026-10-01T00:00:00.000Z' });
    expect(firstMessage(r)).toMatchObject({ message: 'La date de fin doit être après la date de début.', path: ['endsAt'] });
    expect(adminTipUpdateSchema.safeParse({ endsAt: '2026-10-01T00:00:00.000Z' }).success).toBe(true);
  });
});

describe('adminTipListQuerySchema', () => {
  it('accepts category and state filters, both optional', () => {
    expect(adminTipListQuerySchema.parse({})).toEqual({});
    expect(adminTipListQuerySchema.parse({ category: 'REPAIRER', state: 'SCHEDULED' })).toEqual({
      category: 'REPAIRER',
      state: 'SCHEDULED',
    });
    expect(adminTipListQuerySchema.safeParse({ state: 'NOPE' }).success).toBe(false);
  });
});

describe('tip audit actions', () => {
  it.each([
    ['tip.create', 'Création de conseil'],
    ['tip.update', 'Modification de conseil'],
    ['tip.delete', 'Suppression de conseil'],
  ] as const)('%s is an audit action labelled « %s »', (action, label) => {
    expect(ADMIN_AUDIT_ACTIONS).toContain(action);
    expect(ADMIN_AUDIT_ACTION_LABEL[action]).toBe(label);
  });

  it("keeps 'review.delete' for historical rows", () => {
    expect(ADMIN_AUDIT_ACTIONS).toContain('review.delete');
  });
});
