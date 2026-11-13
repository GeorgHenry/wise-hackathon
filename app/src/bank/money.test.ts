import { describe, expect, it } from 'vitest';
import { formatMoney, formatSymbol, fromCents, localDate, rowDate, speakDate, speakMoney, toCents } from './money';

describe('cents', () => {
  it('rounds a float sum to whole cents', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it('turns cents back into an amount with two decimals', () => {
    expect(fromCents(184025)).toBe(1840.25);
  });
});

describe('formatting for the screen', () => {
  it('writes an amount with its currency code', () => {
    expect(formatMoney(1840.25, 'EUR')).toBe('1,840.25 EUR');
  });

  it('keeps two decimals on a round amount', () => {
    expect(formatMoney(30, 'GBP')).toBe('30.00 GBP');
  });

  it('writes an amount with its currency symbol', () => {
    expect(formatSymbol(312.6, 'GBP')).toBe('£312.60');
    expect(formatSymbol(1840.25, 'EUR')).toBe('€1,840.25');
  });
});

describe('money said aloud', () => {
  it('says euros and cents', () => {
    expect(speakMoney(58.1, 'EUR')).toBe('58 euros and 10 cents');
  });

  it('leaves out the cents on a round amount', () => {
    expect(speakMoney(50, 'GBP')).toBe('50 pounds');
  });

  it('uses the singular for one', () => {
    expect(speakMoney(1, 'GBP')).toBe('1 pound');
    expect(speakMoney(0.01, 'EUR')).toBe('1 cent');
  });

  it('says dollars and writes them with their sign', () => {
    expect(speakMoney(20, 'USD')).toBe('20 dollars');
    expect(formatSymbol(20, 'USD')).toBe('$20.00');
  });

  it('says pence for pounds', () => {
    expect(speakMoney(312.6, 'GBP')).toBe('312 pounds and 60 pence');
  });
});

describe('dates', () => {
  it('uses the local calendar day late in the evening', () => {
    expect(localDate(new Date(2026, 10, 13, 23, 30))).toBe('2026-11-13');
  });

  it('uses the local calendar day just after midnight', () => {
    expect(localDate(new Date(2026, 10, 13, 0, 15))).toBe('2026-11-13');
  });

  it('says today, yesterday, or the day and month', () => {
    const now = new Date(2026, 10, 13, 12, 0);
    expect(speakDate('2026-11-13', now)).toBe('today');
    expect(speakDate('2026-11-12', now)).toBe('yesterday');
    expect(speakDate('2026-11-01', now)).toBe('1 November');
  });

  it('writes a short date for a transaction row', () => {
    expect(rowDate('2026-11-09')).toBe('Mon, Nov 9');
  });
});
