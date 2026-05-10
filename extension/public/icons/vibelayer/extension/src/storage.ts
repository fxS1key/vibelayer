// IndexedDB wrapper for local patch persistence. We use `idb` for typed access.
// Schema is intentionally small — one store keyed by patch id, with a domain
// index for the common "get all patches for this site" lookup at page load.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Patch } from '@vibelayer/shared';

interface VibeLayerDB extends DBSchema {
  patches: {
    key: string;
    value: Patch & { dirty: boolean };
    indexes: { 'by-domain': string };
  };
  meta: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<VibeLayerDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<VibeLayerDB>('vibelayer', 1, {
      upgrade(db) {
        const store = db.createObjectStore('patches', { keyPath: 'id' });
        store.createIndex('by-domain', 'domain');
        db.createObjectStore('meta');
      },
    });
  }
  return dbPromise;
}

export async function putPatch(p: Patch, opts: { markDirty?: boolean } = {}): Promise<void> {
  const d = await db();
  await d.put('patches', { ...p, dirty: opts.markDirty ?? true });
}

export async function getPatch(id: string): Promise<Patch | undefined> {
  const d = await db();
  return d.get('patches', id);
}

export async function getPatchesForDomain(domain: string): Promise<Patch[]> {
  const d = await db();
  return d.getAllFromIndex('patches', 'by-domain', domain);
}

export async function getAllPatches(): Promise<Patch[]> {
  const d = await db();
  return d.getAll('patches');
}

export async function getDirtyPatches(): Promise<Patch[]> {
  const all = await getAllPatches();
  return all.filter((p) => (p as Patch & { dirty: boolean }).dirty);
}

export async function markClean(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction('patches', 'readwrite');
  const cur = await tx.store.get(id);
  if (cur) {
    cur.dirty = false;
    await tx.store.put(cur);
  }
  await tx.done;
}

export async function deletePatch(id: string): Promise<void> {
  const d = await db();
  const cur = await d.get('patches', id);
  if (!cur) return;
  // Tombstone, not hard delete — sync needs to propagate the deletion.
  cur.isDeleted = true;
  cur.dirty = true;
  cur.updatedAt = new Date().toISOString();
  await d.put('patches', cur);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const d = await db();
  return (await d.get('meta', key)) as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const d = await db();
  await d.put('meta', value, key);
}
