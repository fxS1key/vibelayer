// Injects/removes a patch's CSS and JS into the active tab.
//
// CSS is appended as a <style data-vibelayer="<id>"> tag so we can remove it by
// selector. JS is NEVER executed in the page realm — instead it runs inside a
// Web Worker created from a Blob. The worker has no DOM access (workers can't
// touch DOM by spec), and we additionally null out fetch/XHR/WebSocket inside
// the worker bootstrap to enforce the no-network policy from the docs.

import type { Patch } from '@vibelayer/shared';

const STYLE_ATTR = 'data-vibelayer';

interface WorkerEntry {
  worker: Worker;
  blobUrl: string;
}
const workers = new Map<string, WorkerEntry>();

// Bootstrap runs BEFORE the patch code. We need ONE controlled use of the
// Function constructor to compile the user patch, so we stash a reference
// (__compile) FIRST, then poison every escape hatch we know of: direct
// globals, the Function global, and the `.constructor` chain (so
// `(function(){}).constructor("...")` and its async/generator variants also
// fail). After bootstrap, the only way to mutate the page is via the
// `postPatch` callback, which is mediated by handleWorkerMessage below.
const WORKER_BOOTSTRAP = `
  var __compile = self.Function;
  (function () {
    var block = function (name) { return function () { throw new Error('VibeLayer: ' + name + ' blocked'); }; };
    self.fetch = block('fetch');
    self.XMLHttpRequest = block('XMLHttpRequest');
    self.WebSocket = block('WebSocket');
    self.EventSource = block('EventSource');
    self.importScripts = block('importScripts');
    self.eval = block('eval');
    var FBlock = block('Function');
    try { Object.defineProperty(Function.prototype, 'constructor', { value: FBlock, writable: false, configurable: false }); } catch (e) {}
    try { Object.defineProperty((async function(){}).constructor.prototype, 'constructor', { value: FBlock, writable: false, configurable: false }); } catch (e) {}
    try { Object.defineProperty((function*(){}).constructor.prototype, 'constructor', { value: FBlock, writable: false, configurable: false }); } catch (e) {}
    try { Object.defineProperty((async function*(){}).constructor.prototype, 'constructor', { value: FBlock, writable: false, configurable: false }); } catch (e) {}
    self.Function = FBlock;
  })();

  self.addEventListener('message', function (e) {
    var data = e.data || {};
    if (data.type !== 'run') return;
    var postPatch = function (msg) { self.postMessage({ type: 'mutate', msg: msg }); };
    try {
      (__compile('postPatch', data.payload))(postPatch);
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err) });
    }
  });
`;
// Whitelist for selectors a patch can target via postPatch. Patches that pass
// an invalid or suspicious selector are silently rejected — better a no-op
// than a thrown DOMException that the user never sees.
export function isSafeSelector(sel: string): boolean {
  if (typeof sel !== 'string') return false;
  if (sel.length === 0 || sel.length > 1000) return false;
  // Disallow shadow-piercing / scope cheats and clear injection markers.
  // `>` alone is the valid CSS child combinator — only block `<` (no CSS use)
  // and the shadow-piercing `>>>`.
  if (/</.test(sel)) return false;
  if (/>>>/.test(sel)) return false;
  if (/:scope\b/i.test(sel)) return false;
  if (typeof document === 'undefined') {
    // Test/runtime without a DOM — accept after the cheap regex checks pass.
    return true;
  }
  try {
    document.createDocumentFragment().querySelector(sel);
    return true;
  } catch {
    return false;
  }
}

export function applyPatch(patch: Patch): void {
  removePatch(patch.id); // idempotent re-apply

  if (patch.css.trim()) {
    const style = document.createElement('style');
    style.setAttribute(STYLE_ATTR, patch.id);
    style.textContent = patch.css;
    document.head.appendChild(style);
  }

  if (patch.js.trim()) {
    const blob = new Blob([WORKER_BOOTSTRAP], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    const worker = new Worker(blobUrl);
    worker.onmessage = (e) => handleWorkerMessage(patch.id, e.data);
    worker.onerror = () => removePatch(patch.id);
    worker.postMessage({ type: 'run', payload: patch.js });
    workers.set(patch.id, { worker, blobUrl });
  }
}

export function removePatch(patchId: string): void {
  document
    .querySelectorAll(`style[${STYLE_ATTR}="${CSS.escape(patchId)}"]`)
    .forEach((el) => el.remove());
  const entry = workers.get(patchId);
  if (entry) {
    entry.worker.terminate();
    URL.revokeObjectURL(entry.blobUrl);
    workers.delete(patchId);
  }
}

// The only DOM mutations a patch can request. Anything else is silently dropped.
function handleWorkerMessage(_patchId: string, data: unknown): void {
  if (!data || typeof data !== 'object') return;
  const d = data as { type: string; msg?: { op: string; selector?: string; value?: string } };
  if (d.type !== 'mutate' || !d.msg?.selector) return;
  if (!isSafeSelector(d.msg.selector)) return;

  let els: NodeListOf<Element>;
  try {
    els = document.querySelectorAll(d.msg.selector);
  } catch {
    return;
  }

  switch (d.msg.op) {
    case 'hide':
      els.forEach((el) => ((el as HTMLElement).style.display = 'none'));
      break;
    case 'text':
      if (d.msg.value != null) els.forEach((el) => (el.textContent = d.msg!.value!));
      break;
    case 'attr':
      // value format: "name=value"
      if (d.msg.value) {
        const [name, ...rest] = d.msg.value.split('=');
        if (name && /^[a-zA-Z_:][a-zA-Z0-9_.:-]*$/.test(name)) {
          els.forEach((el) => el.setAttribute(name, rest.join('=')));
        }
      }
      break;
  }
}
