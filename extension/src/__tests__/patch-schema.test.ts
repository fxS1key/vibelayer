import { describe, it, expect } from 'vitest';
import { PatchSchema } from '@vibelayer/shared';

const base = {
  id: '11111111-1111-4111-8111-111111111111',
  domain: 'example.com',
  name: 'Test',
  css: '',
  js: '',
  affectedSelectors: [],
  enabled: true,
  version: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  isDeleted: false,
};

describe('PatchSchema', () => {
  it('accepts a minimal valid patch', () => {
    expect(PatchSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a non-uuid id', () => {
    expect(PatchSchema.safeParse({ ...base, id: 'nope' }).success).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(PatchSchema.safeParse({ ...base, name: '' }).success).toBe(false);
  });

  it('rejects oversized domain', () => {
    expect(PatchSchema.safeParse({ ...base, domain: 'a'.repeat(300) }).success).toBe(false);
  });

  it('accepts conflictedRemote optionally', () => {
    const parsed = PatchSchema.safeParse({
      ...base,
      conflictedRemote: { css: 'a {}', js: '', updatedAt: '2026-01-02T00:00:00.000Z' },
    });
    expect(parsed.success).toBe(true);
  });
});
