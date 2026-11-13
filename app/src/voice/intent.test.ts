import { describe, expect, it } from 'vitest';
import { parseIntent } from './intent';

describe('what the user wants', () => {
  it('hears a balance question', () => {
    expect(parseIntent("What's my balance?")).toEqual({ kind: 'balance' });
    expect(parseIntent('How much money do I have')).toEqual({ kind: 'balance' });
  });

  it('hears a question about money coming in', () => {
    expect(parseIntent("Did Kadri's money arrive?")).toEqual({ kind: 'incoming' });
    expect(parseIntent('Has my pension come in')).toEqual({ kind: 'incoming' });
  });

  it('hears a request to send, with the amount and currency', () => {
    expect(parseIntent('Send Oskar 30 pounds')).toEqual({ kind: 'send', amount: 30, currency: 'GBP' });
    expect(parseIntent('send 12.50 euros to Toivo')).toEqual({ kind: 'send', amount: 12.5, currency: 'EUR' });
  });

  it('hears dollars', () => {
    expect(parseIntent('Transfer 20 dollars to Martin')).toEqual({ kind: 'send', amount: 20, currency: 'USD' });
  });

  it('hears a request to send that leaves the amount for later', () => {
    expect(parseIntent('I want to send money to Kadri')).toEqual({ kind: 'send' });
  });

  it('hears a bare amount', () => {
    expect(parseIntent('40 pounds')).toEqual({ kind: 'amount', amount: 40, currency: 'GBP' });
  });

  it('hears a change of amount', () => {
    expect(parseIntent('make it 40')).toEqual({ kind: 'amount', amount: 40 });
    expect(parseIntent('No, make it 40 pounds')).toEqual({ kind: 'amount', amount: 40, currency: 'GBP' });
  });

  it('hears a clear yes', () => {
    expect(parseIntent('yes, send it')).toEqual({ kind: 'yes' });
    expect(parseIntent('Okay')).toEqual({ kind: 'yes' });
  });

  it('hears a no', () => {
    expect(parseIntent('no, cancel')).toEqual({ kind: 'no' });
    expect(parseIntent("Don't send it")).toEqual({ kind: 'no' });
  });

  it('does not take a doubtful yes as a yes', () => {
    expect(parseIntent('yes but change it').kind).not.toBe('yes');
    expect(parseIntent('yes?').kind).not.toBe('yes');
  });

  it('admits when it does not understand', () => {
    expect(parseIntent('Tell me a joke')).toEqual({ kind: 'unknown' });
  });
});
