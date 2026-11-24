import { describe, it, expect } from 'vitest';
import { parseEuros, formatEuros, refundSummary, centsToInputValue, buildRefundBody } from '../lib/refund-form';

describe('parseEuros', () => {
  it('accepts a comma decimal with one digit', () => {
    expect(parseEuros('12,5')).toBe(1250);
  });

  it('accepts a dot decimal with two digits', () => {
    expect(parseEuros('12.50')).toBe(1250);
  });

  it('accepts zero', () => {
    expect(parseEuros('0')).toBe(0);
  });

  it('accepts a whole amount with no separator', () => {
    expect(parseEuros('80')).toBe(8000);
  });

  it('rejects a 3rd fraction digit', () => {
    expect(parseEuros('12.505')).toBeNull();
  });

  it('rejects a thousands separator (space)', () => {
    expect(parseEuros('1 000,00')).toBeNull();
  });

  it('rejects a sign', () => {
    expect(parseEuros('-3')).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(parseEuros('')).toBeNull();
  });

  it('rejects more than one separator', () => {
    expect(parseEuros('1,2,3')).toBeNull();
  });

  it('rejects letters', () => {
    expect(parseEuros('abc')).toBeNull();
  });

  it('rejects a lone separator', () => {
    expect(parseEuros(',')).toBeNull();
  });

  it('rejects a trailing separator with no fraction digits', () => {
    expect(parseEuros('5.')).toBeNull();
  });

  it('rejects a leading separator with no whole digits', () => {
    expect(parseEuros('.5')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(parseEuros('  12,50  ')).toBe(1250);
  });
});

describe('formatEuros', () => {
  it('renders a whole amount with no decimals', () => {
    expect(formatEuros(8000)).toBe('80 €');
  });

  it('renders a fractional amount with a comma', () => {
    expect(formatEuros(1250)).toBe('12,50 €');
  });
});

describe('centsToInputValue', () => {
  it('renders the comma form the parser accepts', () => {
    expect(centsToInputValue(8000)).toBe('80,00');
  });

  it('round-trips through parseEuros', () => {
    expect(parseEuros(centsToInputValue(1250))).toBe(1250);
  });
});

describe('refundSummary', () => {
  // Order: repair 8000, shipping 1000, insurance 200, protection 500. Not yet
  // transferred to the réparateur (unpaid). Admin refunds repair 3000 (partial),
  // shipping+insurance in full (1200), protection in full (500).
  it('unpaid partial: réparateur share is versés', () => {
    const order = { repairCents: 8000, transferred: false, shippingCents: 1000, insuranceCents: 200, protectionCents: 500 };
    const result = refundSummary({ repairCents: 3000, shippingCents: 1200, protectionCents: 500 }, order);
    expect(result.clientCents).toBe(4700);
    expect(result.repairerCents).toBe(5000);
    expect(result.repairerVerb).toBe('versés');
    expect(result.revimeKeepsCents).toBe(0);
  });

  // Already paid (transferred), partial refund of repair (X < repair): the
  // réparateur keeps what was not clawed back.
  it('paid partial: réparateur share is conservés', () => {
    const order = { repairCents: 8000, transferred: true, shippingCents: 1000, insuranceCents: 200, protectionCents: 500 };
    const result = refundSummary({ repairCents: 3000, shippingCents: 0, protectionCents: 0 }, order);
    expect(result.clientCents).toBe(3000);
    expect(result.repairerCents).toBe(5000);
    expect(result.repairerVerb).toBe('conservés');
    expect(result.revimeKeepsCents).toBe(1700);
  });

  // Already paid, full refund of the repair (X = repair): the whole transfer is
  // reversed, so the réparateur ends up with nothing - "repris".
  it('paid full repair refund (X=0 share left): réparateur share is repris', () => {
    const order = { repairCents: 8000, transferred: true, shippingCents: 1000, insuranceCents: 200, protectionCents: 500 };
    const result = refundSummary({ repairCents: 8000, shippingCents: 1200, protectionCents: 500 }, order);
    expect(result.clientCents).toBe(9700);
    expect(result.repairerCents).toBe(0);
    expect(result.repairerVerb).toBe('repris');
    expect(result.revimeKeepsCents).toBe(0);
  });

  // CF5-22 Outcome 3: Unpaid full refund - client gets 100%, repairer receives nothing (0 €)
  it('unpaid full refund: client gets 100%, repairer gets 0 €', () => {
    const order = { repairCents: 8000, transferred: false, shippingCents: 1000, insuranceCents: 200, protectionCents: 500 };
    const result = refundSummary({ repairCents: 8000, shippingCents: 1200, protectionCents: 500 }, order);
    expect(result.clientCents).toBe(9700);
    expect(result.repairerCents).toBe(0);
    expect(result.revimeKeepsCents).toBe(0);
  });

  // Full refund of everything, unpaid réparateur: he simply gets nothing (repair
  // fully refunded), verb is versés (not transferred) even though the amount is 0.
  it('full refund, unpaid: réparateur share is 0 and verb stays versés', () => {
    const order = { repairCents: 8000, transferred: false, shippingCents: 1000, insuranceCents: 200, protectionCents: 500 };
    const result = refundSummary({ repairCents: 8000, shippingCents: 1200, protectionCents: 500 }, order);
    expect(result.clientCents).toBe(9700);
    expect(result.repairerCents).toBe(0);
    expect(result.repairerVerb).toBe('versés');
    expect(result.revimeKeepsCents).toBe(0);
  });
});

describe('buildRefundBody', () => {
  const order = { repairCents: 8000, transferred: false, shippingCents: 1000, insuranceCents: 200, protectionCents: 500 };
  const validFields = {
    motif: 'CLIENT_CANCELLED' as const,
    note: 'Annulation demandée par le client',
    repairInput: '30,00',
    shippingInput: '12,00',
    protectionInput: '5,00',
  };

  it('returns the parsed body on valid fields (the frozen snapshot)', () => {
    const result = buildRefundBody(validFields, order);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body).toEqual({
        motif: 'CLIENT_CANCELLED',
        note: 'Annulation demandée par le client',
        repairCents: 3000,
        shippingCents: 1200,
        protectionCents: 500,
      });
    }
  });

  it('trims the note in the returned body', () => {
    const result = buildRefundBody({ ...validFields, note: '  Annulation demandée  ' }, order);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.note).toBe('Annulation demandée');
  });

  it('rejects an empty motif', () => {
    const result = buildRefundBody({ ...validFields, motif: '' }, order);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.motif).toBeDefined();
  });

  it('rejects a note shorter than 3 characters', () => {
    const result = buildRefundBody({ ...validFields, note: 'ok' }, order);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.note).toBeDefined();
  });

  it('rejects an unparseable amount', () => {
    const result = buildRefundBody({ ...validFields, repairInput: '5.' }, order);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.repair).toBeDefined();
  });

  it('rejects an amount above its ceiling', () => {
    const result = buildRefundBody({ ...validFields, repairInput: '9000' }, order);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.repair).toBeDefined();
  });

  it('rejects a shipping amount above the shipping+insurance ceiling', () => {
    const result = buildRefundBody({ ...validFields, shippingInput: '13,00' }, order);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.shipping).toBeDefined();
  });

  it('rejects a total of zero', () => {
    const result = buildRefundBody(
      { ...validFields, repairInput: '0', shippingInput: '0', protectionInput: '0' },
      order,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.repair).toBeDefined();
  });
});
