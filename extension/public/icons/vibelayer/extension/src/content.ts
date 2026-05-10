// Content script. Two jobs:
//   1. On request from background, produce a sanitized DOM snapshot (no PII,
//      no secrets) and send it back.
//   2. Receive patch.apply / patch.remove messages and call into the injector.
//
// The sanitization rules below are deliberately aggressive — we'd rather drop a
// useful selector than leak a password.

import { applyPatch, removePatch } from './patch-injector.js';
import type { Patch } from '@vibelayer/shared';

const PII_PATTERNS = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/g, // emails
  /\b(?:\d[ -]*?){13,19}\b/g, // long digit runs (card numbers)
  /\b\+?\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g, // phones
];

function scrubText(s: string): string {
  let out = s;
  for (const re of PII_PATTERNS) out = out.replace(re, '[REDACTED]');
  return out;
}

function snapshotDom(): unknown {
  // Clone so we never mutate the live page during sanitization.
  const clone = document.documentElement.cloneNode(true) as HTMLElement;

  // Strip anything that could carry user secrets.
  clone.querySelectorAll('input, textarea, select').forEach((el) => {
    el.removeAttribute('value');
    if (el instanceof HTMLTextAreaElement) el.textContent = '';
  });
  clone.querySelectorAll('script, noscript, style[data-vibelayer]').forEach((el) => el.remove());
  clone.querySelectorAll('[autocomplete="current-password"], [type="password"]').forEach((el) =>
    el.remove(),
  );

  // Drop data-* attributes that look like identifiers.
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode() as Element | null;
  while (node) {
    for (const attr of Array.from(node.attributes)) {
      if (attr.name.startsWith('data-') && /\d{4,}|@/.test(attr.value)) {
        node.removeAttribute(attr.name);
      }
    }
    node = walker.nextNode() as Element | null;
  }

  // Cap HTML size — the API also enforces this, but capping early saves bandwidth.
  const html = scrubText(clone.outerHTML).slice(0, 120_000);

  return {
    url: location.href,
    domain: location.hostname,
    title: document.title.slice(0, 500),
    html,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    capturedAt: new Date().toISOString(),
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.kind === 'snapshot.collect') {
    try {
      sendResponse({ kind: 'snapshot.response', snapshot: snapshotDom() });
    } catch (err) {
      sendResponse({ kind: 'snapshot.response', error: String(err) });
    }
    return true;
  }
  if (msg?.kind === 'patch.apply') {
    applyPatch(msg.patch as Patch);
    return false;
  }
  if (msg?.kind === 'patch.remove') {
    removePatch(msg.patchId as string);
    return false;
  }
  return false;
});
