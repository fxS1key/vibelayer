import { describe, it, expect } from 'vitest';
import { isSafeSelector } from '../patch-injector.js';

describe('isSafeSelector', () => {
  it('accepts plain selectors', () => {
    expect(isSafeSelector('.foo')).toBe(true);
    expect(isSafeSelector('div > span')).toBe(true);
    expect(isSafeSelector('[aria-label="x"]')).toBe(true);
  });

  it('rejects empty and oversized input', () => {
    expect(isSafeSelector('')).toBe(false);
    expect(isSafeSelector('a'.repeat(2000))).toBe(false);
  });

  it('rejects shadow-piercing and angle brackets', () => {
    expect(isSafeSelector('div >>> span')).toBe(false);
    expect(isSafeSelector('<script>')).toBe(false);
  });

  it('rejects :scope', () => {
    expect(isSafeSelector(':scope > div')).toBe(false);
    expect(isSafeSelector(':SCOPE')).toBe(false);
  });

  it('rejects non-string input', () => {
    // @ts-expect-error intentional bad input
    expect(isSafeSelector(null)).toBe(false);
    // @ts-expect-error intentional bad input
    expect(isSafeSelector(42)).toBe(false);
  });
});
