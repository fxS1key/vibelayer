// Side panel UI. Stateless display layer — all persistence lives in storage.ts
// and all network in background. The panel just orchestrates the user flow:
//   prompt → estimate → generate → preview → apply/reject → save.

import { useCallback, useEffect, useState } from 'react';
import type { GeneratedPatch, Patch } from '@vibelayer/shared';
import { getByokKey } from '../byok.js';
import { putPatch } from '../storage.js';

interface State {
  prompt: string;
  estimateTokens: number;
  generating: boolean;
  patch: GeneratedPatch | null;
  error: string | null;
  notice: string | null;
}

// Rough estimate: 1 token ≈ 4 chars of input + a fixed overhead for the system
// prompt and DOM snapshot. Good enough for a UI hint — server is authoritative.
function estimateTokens(prompt: string): number {
  return Math.ceil(prompt.length / 4) + 600;
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function requestSnapshot(tabId: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ kind: 'snapshot.request', tabId }, (resp) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(resp?.snapshot);
    });
  });
}

export function App() {
  const [state, setState] = useState<State>({
    prompt: '',
    estimateTokens: 0,
    generating: false,
    patch: null,
    error: null,
    notice: null,
  });

  useEffect(() => {
    setState((s) => ({ ...s, estimateTokens: estimateTokens(s.prompt) }));
  }, [state.prompt]);

  const generate = useCallback(async () => {
    setState((s) => ({ ...s, generating: true, error: null, patch: null }));
    try {
      const tab = await getActiveTab();
      if (!tab?.id || !tab.url) throw new Error('No active tab');
      const snapshot = await requestSnapshot(tab.id);

      const byok = await getByokKey();
      const res = await fetch('https://api.vibelayer.io/api/v1/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: state.prompt,
          snapshot,
          ...(byok ? { byokKey: byok.apiKey, byokProvider: byok.provider } : {}),
        }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = (await res.json()) as { patch: GeneratedPatch };
      setState((s) => ({ ...s, patch: data.patch, generating: false }));
    } catch (e) {
      setState((s) => ({ ...s, error: String(e), generating: false }));
    }
  }, [state.prompt]);

  const apply = useCallback(async () => {
    if (!state.patch) return;
    const tab = await getActiveTab();
    if (!tab?.id || !tab.url) return;
    const domain = new URL(tab.url).hostname;
    const now = new Date().toISOString();
    const patch: Patch = {
      id: crypto.randomUUID(),
      domain,
      name: state.patch.description.slice(0, 60) || 'Untitled patch',
      description: state.patch.description,
      css: state.patch.css,
      js: state.patch.js,
      affectedSelectors: state.patch.affectedSelectors,
      enabled: true,
      version: 0,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };
    await putPatch(patch);
    chrome.tabs.sendMessage(tab.id, { kind: 'patch.apply', tabId: tab.id, patch });
    setState((s) => ({ ...s, notice: 'Applied & saved', patch: null, prompt: '' }));
  }, [state.patch]);

  return (
    <div className="vl-panel">
      <textarea
        className="vl-prompt"
        placeholder="Describe how this site should look or behave…"
        value={state.prompt}
        onChange={(e) => setState((s) => ({ ...s, prompt: e.target.value }))}
      />
      <div className="vl-row">
        <span className="vl-est">
          ~{state.estimateTokens} tokens · ${((state.estimateTokens / 1000) * 0.04).toFixed(3)}
        </span>
        <button
          className="vl-btn"
          disabled={state.generating || state.prompt.length < 3}
          onClick={generate}
        >
          {state.generating ? 'Generating…' : 'Generate'}
        </button>
      </div>
      {state.error && <div className="vl-error">{state.error}</div>}
      {state.notice && <div className="vl-ok">{state.notice}</div>}
      {state.patch && (
        <>
          <div className="vl-preview">
            <strong>{state.patch.description}</strong>
            {'\n\n/* CSS */\n'}
            {state.patch.css}
            {state.patch.js && '\n\n/* JS */\n'}
            {state.patch.js}
          </div>
          <div className="vl-row">
            <button
              className="vl-btn vl-btn-ghost"
              onClick={() => setState((s) => ({ ...s, patch: null }))}
            >
              Reject
            </button>
            <button className="vl-btn" onClick={apply}>
              Apply & save
            </button>
          </div>
        </>
      )}
    </div>
  );
}
