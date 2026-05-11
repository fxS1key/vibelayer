// Ed25519 signing of patches issued by /api/v1/generate.
//
// Why: a MITM (or compromised proxy) can otherwise inject arbitrary JS via the
// generate endpoint and the extension will happily run it in the sandbox.
// Signing pins the patch to a known issuer key the extension trusts.
//
// Key material:
//   PATCH_SIGNING_PRIVATE_KEY  — raw 32-byte Ed25519 seed, hex-encoded (64 chars).
//   PATCH_SIGNING_PUBLIC_KEY   — raw 32-byte Ed25519 public key, hex-encoded.
// Generate with: `node -e "const {generateKeyPairSync, createPrivateKey, createPublicKey} = require('crypto'); const {privateKey, publicKey} = generateKeyPairSync('ed25519'); console.log('priv=', privateKey.export({format:'der', type:'pkcs8'}).slice(-32).toString('hex')); console.log('pub=', publicKey.export({format:'der', type:'spki'}).slice(-32).toString('hex'));"`
//
// If no key is configured, signing is a no-op and the extension's verify check
// is skipped — useful for dev / self-hosted setups that don't need it.

import { createPrivateKey, sign as nodeSign } from 'node:crypto';
import type { GeneratedPatch } from '@vibelayer/shared';

function hexToBuf(hex: string): Buffer {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length !== 64) {
    throw new Error('Ed25519 key must be 32 bytes (64 hex chars).');
  }
  return Buffer.from(hex, 'hex');
}

// PKCS#8 DER prefix for an Ed25519 private key followed by the 32-byte seed.
// Node's crypto.createPrivateKey wants PKCS#8 (or JWK); we synthesize it from
// the raw seed so the env var is a single hex blob.
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

let cachedKey: ReturnType<typeof createPrivateKey> | null = null;

function loadKey(): ReturnType<typeof createPrivateKey> | null {
  if (cachedKey) return cachedKey;
  const hex = process.env.PATCH_SIGNING_PRIVATE_KEY;
  if (!hex) return null;
  const seed = hexToBuf(hex);
  const pkcs8 = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
  cachedKey = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  return cachedKey;
}

export function canonicalize(patch: GeneratedPatch): string {
  // Stable JSON: object keys sorted. Don't rely on JSON.stringify key order;
  // some object spreads land non-alphabetically and would break verification.
  const ordered = {
    affectedSelectors: patch.affectedSelectors,
    css: patch.css,
    description: patch.description,
    js: patch.js,
  };
  return JSON.stringify(ordered);
}

export interface SignedPatch {
  patch: GeneratedPatch;
  signature?: string; // base64; absent if no signing key configured
}

export function signPatch(patch: GeneratedPatch): SignedPatch {
  const key = loadKey();
  if (!key) return { patch };
  const sig = nodeSign(null, Buffer.from(canonicalize(patch), 'utf8'), key);
  return { patch, signature: sig.toString('base64') };
}
