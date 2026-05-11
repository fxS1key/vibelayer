import { describe, it, expect } from 'vitest';
import { dominates, resolveClocks } from '@vibelayer/shared';

describe('vector clocks', () => {
  it('detects a strict dominator', () => {
    expect(dominates({ a: 2 }, { a: 1 })).toBe(true);
    expect(dominates({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('treats equal clocks as non-dominating', () => {
    expect(dominates({ a: 1, b: 1 }, { a: 1, b: 1 })).toBe(false);
  });

  it('treats missing keys as zero', () => {
    expect(dominates({ a: 1, b: 1 }, { a: 1 })).toBe(true);
    expect(dominates({ a: 1 }, { a: 1, b: 1 })).toBe(false);
  });

  it('resolves to conflict when neither dominates and content differs', () => {
    expect(resolveClocks({ a: 1, b: 0 }, { a: 0, b: 1 })).toBe('conflict');
  });

  it('resolves local/remote/equal correctly', () => {
    expect(resolveClocks({ a: 2 }, { a: 1 })).toBe('local');
    expect(resolveClocks({ a: 1 }, { a: 2 })).toBe('remote');
    expect(resolveClocks({ a: 1 }, { a: 1 })).toBe('equal');
  });
});
