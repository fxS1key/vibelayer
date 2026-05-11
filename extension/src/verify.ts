// Verifies Ed25519 signatures on patches issued by the VibeLayer server.
//
// The public key is embedded at build time via VITE_PATCH_SIGNING_PUBLIC_KEY
// (raw 32-byte Ed25519 public key, hex). If no public key is configured the
// verification step is skipped — useful for dev and self-hosted setups, but
// production builds should always set it.

import type { GeneratedPatch } from '@vibelayer/shared';

const PUBKEY_HEX = (import.meta as ImportMeta & { env?: Record<string, string> }).env
  ?.VITE_PATCH_SIGNING_PUBLIC_KEY;

function hexToBytes(hex: string): ArrayBuffer {
  const buf = new ArrayBuffer(hex.length / 2);
  const view = new Uint8Array(buf);
  for (let i = 0; i < view.length; i++) view[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return buf;
}

function base64ToBytes(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < view.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

function canonicalize(patch: GeneratedPatch): string {
  const ordered = {
    affectedSelectors: patch.affectedSelectors,
    css: patch.css,
    description: patch.description,
    js: patch.js,
  };
  return JSON.stringify(ordered);
}

let cachedKey: CryptoKey | null = null;

async function loadKey(): Promise<CryptoKey | null> {
  if (cachedKey) return cachedKey;
  if (!PUBKEY_HEX || PUBKEY_HEX.length !== 64) return null;
  const raw = hexToBytes(PUBKEY_HEX);
  cachedKey = await crypto.subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify']);
  return cachedKey;
}

// Returns true when verification passes OR when no key is configured (dev / OSS
// self-host). Returns false ONLY when a key is configured and the signature
// fails. Callers should refuse to apply the patch on `false`.
export async function verifyPatchSignature(
  patch: GeneratedPatch,
  signatureBase64: string | undefined,
): Promise<boolean> {
  const key = await loadKey();
  if (!key) return true;
  if (!signatureBase64) return false;
  try {
    const sig = base64ToBytes(signatureBase64);
    const msgBytes = new TextEncoder().encode(canonicalize(patch));
    // Slice into a fresh ArrayBuffer to satisfy BufferSource (avoids
    // SharedArrayBuffer-tainted Uint8Array typing under lib.dom.d.ts).
    const msg = msgBytes.buffer.slice(msgBytes.byteOffset, msgBytes.byteOffset + msgBytes.byteLength);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, sig, msg);
  } catch {
    return false;
  }
}
