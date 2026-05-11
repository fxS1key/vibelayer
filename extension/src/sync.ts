// Cloud sync. Lives in the service worker (see background.ts).
//
// Design:
//   - Push loop: every N seconds, drain dirty patches → POST /api/v1/sync.
//   - Pull loop: long-lived SSE connection to /api/v1/sync/events delivers
//     remote updates as `patch.updated` / `patch.deleted` events.
//   - Conflict resolution: vector clock comparison. If neither clock dominates
//     and content differs → mark patch as `conflicted` in IndexedDB; the panel
//     surfaces a merge UI. We never silently overwrite local edits.
//
// The free tier short-circuits this whole module: getMeta('cloudSyncEnabled')
// returns false and the loops no-op.

import { getDirtyPatches, getMeta, markClean, putPatch, setMeta } from './storage.js';
import { PatchSchema, type VectorClock } from '@vibelayer/shared';

const PUSH_INTERVAL_MS = 15_000;

async function authHeaders(): Promise<HeadersInit | null> {
  const token = await getMeta<string>('authToken');
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
}

async function apiBase(): Promise<string> {
  return (await getMeta<string>('apiBase')) ?? 'https://api.vibelayer.io';
}

async function pushOnce(): Promise<void> {
  const headers = await authHeaders();
  if (!headers) return; // not logged in — local-only mode
  const dirty = await getDirtyPatches();
  if (dirty.length === 0) return;

  const deviceId = (await getMeta<string>('deviceId')) ?? crypto.randomUUID();
  await setMeta('deviceId', deviceId);

  let res: Response;
  try {
    res = await fetch(`${await apiBase()}/api/v1/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ deviceId, patches: dirty }),
    });
  } catch {
    return; // server unreachable (e.g. self-hosted not running) — retry next tick
  }
  if (!res.ok) return; // retry on next tick

  // Mark synced patches clean. Conflict resolution result (if any) comes back
  // via SSE — we don't try to handle it inline.
  for (const p of dirty) await markClean(p.id);
}

function dominates(a: VectorClock, b: VectorClock): boolean {
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

export function resolve(local: VectorClock, remote: VectorClock): 'local' | 'remote' | 'conflict' {
  if (dominates(local, remote)) return 'local';
  if (dominates(remote, local)) return 'remote';
  return 'conflict';
}

let pushTimer: ReturnType<typeof setInterval> | null = null;
let eventSourceCleanup: (() => void) | null = null;

export function startSyncLoop(): void {
  if (pushTimer) return;
  pushTimer = setInterval(() => {
    pushOnce().catch(() => {
      // Transient network failure — next tick retries. Anything persistent
      // (auth expired, server gone) will fix itself when the user re-auths.
    });
  }, PUSH_INTERVAL_MS);

  // SSE pull. EventSource isn't available in service workers in all browsers
  // yet, so we use fetch + ReadableStream — slightly more code, broader support.
  startEventStream().catch(() => {
    // Server unreachable (e.g. self-hosted not running). Stream stays off until
    // next startSyncLoop() call — the push loop's catch keeps us alive.
  });
}

async function startEventStream(): Promise<void> {
  const headers = await authHeaders();
  if (!headers) return;
  let res: Response;
  try {
    res = await fetch(`${await apiBase()}/api/v1/sync/events`, { headers });
  } catch {
    return; // server unreachable
  }
  if (!res.ok || !res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  eventSourceCleanup = () => reader.cancel().catch(() => {});

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() ?? '';
    for (const block of lines) {
      const data = block.split('\n').find((l) => l.startsWith('data: '))?.slice(6);
      if (!data) continue;
      try {
        const evt = JSON.parse(data) as { type: string; patch?: unknown };
        if (evt.type === 'patch.updated' && evt.patch) {
          // The server is trusted but not infallible — validate before we let
          // a remote payload land in IndexedDB. A bad patch is dropped; the
          // server will resend on next reconnect.
          const parsed = PatchSchema.safeParse(evt.patch);
          if (parsed.success) await putPatch(parsed.data, { markDirty: false });
        }
      } catch {
        // ignore malformed events — server will resend
      }
    }
  }
}

export function stopSyncLoop(): void {
  if (pushTimer) clearInterval(pushTimer);
  pushTimer = null;
  eventSourceCleanup?.();
}
