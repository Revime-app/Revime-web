import { describe, expect, it } from 'vitest';
import { formDatesToInstants, instantsToFormDates, periodLabel, TIP_POOL_LABEL } from '../lib/tip-format';

/** CF4-38 (spec §4.4). Pure helpers of the « Conseils du jour » page. Paris days throughout. */

describe('periodLabel', () => {
  // endsAt is EXCLUSIVE: a period « au 15 oct. » is stored as 00:00 Paris on 16 Oct.
  const start = '2026-09-30T22:00:00.000Z'; // 00:00 Paris, 1 Oct (UTC+2)
  const end = '2026-10-15T22:00:00.000Z'; // 00:00 Paris, 16 Oct

  it('both bounds → « Du 1 oct. au 15 oct. » (end shown as the day before the exclusive endsAt)', () => {
    expect(periodLabel(start, end)).toBe('Du 1 oct. au 15 oct.');
  });

  it('start only → « À partir du 1 oct. »', () => {
    expect(periodLabel(start, null)).toBe('À partir du 1 oct.');
  });

  it("end only → « Jusqu'au 15 oct. »", () => {
    expect(periodLabel(null, end)).toBe("Jusqu'au 15 oct.");
  });

  it('none → « Sans limite »', () => {
    expect(periodLabel(null, null)).toBe('Sans limite');
  });

  it('reads Paris days across the October DST switch', () => {
    // 00:00 Paris on 1 Nov (UTC+1) is 31 Oct 23:00Z; the last shown day is 31 Oct.
    expect(periodLabel(null, '2026-10-31T23:00:00.000Z')).toBe("Jusqu'au 31 oct.");
  });
});

describe('formDatesToInstants', () => {
  it('start = 00:00 Paris of the start day, end = 00:00 Paris of the day AFTER the end day', () => {
    expect(formDatesToInstants('2026-10-01', '2026-10-15')).toEqual({
      startsAt: '2026-09-30T22:00:00.000Z',
      endsAt: '2026-10-15T22:00:00.000Z',
    });
  });

  it('empty inputs are open bounds', () => {
    expect(formDatesToInstants('', '')).toEqual({ startsAt: null, endsAt: null });
    expect(formDatesToInstants('', '2026-10-31')).toEqual({ startsAt: null, endsAt: '2026-10-31T23:00:00.000Z' });
  });

  it('a one-day period (start = end) is a valid window', () => {
    const { startsAt, endsAt } = formDatesToInstants('2026-10-10', '2026-10-10');
    expect(Date.parse(endsAt!) - Date.parse(startsAt!)).toBe(86_400_000);
  });
});

describe('instantsToFormDates', () => {
  it('is the inverse of formDatesToInstants', () => {
    for (const [s, e] of [
      ['2026-10-01', '2026-10-15'],
      ['2026-10-20', '2026-11-03'],
      ['2026-03-28', '2026-03-29'],
      ['', '2026-12-31'],
      ['2026-01-01', ''],
    ] as const) {
      const i = formDatesToInstants(s, e);
      expect(instantsToFormDates(i.startsAt, i.endsAt)).toEqual({ start: s, end: e });
    }
  });
});

describe('TIP_POOL_LABEL', () => {
  it('names the three pools', () => {
    expect(TIP_POOL_LABEL).toEqual({ CLIENT: 'Clients', REPAIRER: 'Réparateurs', ALL: 'Tous' });
  });
});
