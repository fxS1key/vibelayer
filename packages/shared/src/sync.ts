import { z } from 'zod';
import { PatchSchema } from './patch.js';

// Vector clock: map of deviceId → monotonic counter. We compare clocks pairwise
// to detect concurrent edits (neither clock dominates → conflict).
export const VectorClockSchema = z.record(z.string(), z.number().int().nonnegative());
export type VectorClock = z.infer<typeof VectorClockSchema>;

export function dominates(a: VectorClock, b: VectorClock): boolean {
  let strictlyGreater = false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const av = a[k] ?? 0;
    const bv = b[k] ?? 0;
    if (av < bv) return false;
    if (av > bv) strictlyGreater = true;
  }
  return strictlyGreater;
}

export function resolveClocks(local: VectorClock, remote: VectorClock): 'local' | 'remote' | 'equal' | 'conflict' {
  if (dominates(local, remote)) return 'local';
  if (dominates(remote, local)) return 'remote';
  const sameKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  for (const k of sameKeys) if ((local[k] ?? 0) !== (remote[k] ?? 0)) return 'conflict';
  return 'equal';
}

export const SyncPushSchema = z.object({
  deviceId: z.string().uuid(),
  patches: z.array(
    PatchSchema.extend({
      vectorClock: VectorClockSchema,
      // Encrypted blob — server never sees plaintext css/js when E2EE is on.
      ciphertext: z.string().optional(),
    }),
  ),
});
export type SyncPush = z.infer<typeof SyncPushSchema>;

export const SyncPullSchema = z.object({
  deviceId: z.string().uuid(),
  since: z.string().datetime().optional(),
});
export type SyncPull = z.infer<typeof SyncPullSchema>;

export const SyncEventSchema = z.object({
  type: z.enum(['patch.updated', 'patch.deleted', 'sync.conflict']),
  patchId: z.string().uuid(),
  vectorClock: VectorClockSchema,
  occurredAt: z.string().datetime(),
});
export type SyncEvent = z.infer<typeof SyncEventSchema>;
