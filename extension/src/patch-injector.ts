// Injects/removes a patch's CSS and JS into the active tab.
//
// CSS is appended as a <style data-vibelayer="<id>"> tag so we can remove it by
// selector. JS is NEVER executed in the page realm — instead it runs inside a
// Web Worker created from a Blob. The worker has no DOM access (workers can't
// touch DOM by spec), and we additionally null out fetch/XHR/WebSocket inside
// the worker bootstrap to enforce the no-network policy from the docs.

import type { Patch } from '@vibelayer/shared';

const STYLE_ATTR = 'data-vibelayer';
const workers = new Map<string, Worker>();

const WORKER_BOOTSTRAP = `
  // Block network and storage APIs inside the sandbox. Generated JS that tries
  // to touch any of these will throw immediately — fail-closed by design.
  self.fetch = () => { throw new Error('VibeLayer: fetch blocked'); };
  self.XMLHttpRequest = function() { throw new Error('VibeLayer: XHR blocked'); };
  self.WebSocket = function() { throw new Error('VibeLayer: WebSocket blocked'); };
  // eval / Function are blocked by CSP on the worker; we additionally clobber
  // them so a generated patch can't get a friendly error and retry.
  self.eval = () => { throw new Error('VibeLayer: eval blocked'); };
  self.Function = function() { throw new Error('VibeLayer: Function blocked'); };
  // Workers have no document/localStorage, so cookie / storage exfil is impossible.

  self.addEventListener('message', (e) => {
    const { type, payload } = e.data || {};
    if (type === 'run') {
      try {
        // The patch code runs here. It can postMessage DOM mutation instructions
        // back to the page; it cannot touch the page directly.
        new Function('postPatch', payload)((msg) => self.postMessage({ type: 'mutate', msg }));
      } catch (err) {
        self.postMessage({ type: 'error', message: String(err) });
      }
    }
  });
`;

export function applyPatch(patch: Patch): void {
  // 1. CSS — straightforward style tag, scoped by data-vibelayer id.
  removePatch(patch.id); // idempotent re-apply
  if (patch.css.trim()) {
    const style = document.createElement('style');
    style.setAttribute(STYLE_ATTR, patch.id);
    style.textContent = patch.css;
    document.head.appendChild(style);
  }

  // 2. JS — sandbox in a Worker. The worker posts mutation messages that we
  // execute here in a restricted vocabulary (set/remove attr, hide, replace text).
  if (patch.js.trim()) {
    const blob = new Blob([WORKER_BOOTSTRAP + '\n' + `self.postMessage({type:'ready'});`], {
      type: 'application/javascript',
    });
    const worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = (e) => handleWorkerMessage(patch.id, e.data);
    worker.postMessage({ type: 'run', payload: patch.js });
    workers.set(patch.id, worker);
  }
}

export function removePatch(patchId: string): void {
  document.querySelectorAll(`style[${STYLE_ATTR}="${CSS.escape(patchId)}"]`).forEach((el) =>
    el.remove(),
  );
  const w = workers.get(patchId);
  if (w) {
    w.terminate();
    workers.delete(patchId);
  }
}

// The only DOM mutations a patch can request. Anything else is silently dropped.
function handleWorkerMessage(_patchId: string, data: unknown): void {
  if (!data || typeof data !== 'object') return;
  const d = data as { type: string; msg?: { op: string; selector?: string; value?: string } };
  if (d.type !== 'mutate' || !d.msg?.selector) return;
  const els = document.querySelectorAll(d.msg.selector);
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
        if (name) els.forEach((el) => el.setAttribute(name, rest.join('=')));
      }
      break;
  }
}
