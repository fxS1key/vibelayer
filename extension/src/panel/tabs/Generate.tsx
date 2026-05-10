// Generate tab — the main flow: prompt → estimate → generate → preview → apply.

import { useCallback, useEffect, useState } from 'react';
import type { GeneratedPatch, Patch } from '@vibelayer/shared';
import { getByokKey } from '../../byok.js';
import { putPatch } from '../../storage.js';
import {
  checkSpendCap,
  getSettings,
  isDomainAllowed,
  pushHistory,
  recordSpend,
  type Settings,
} from '../../settings.js';
import { Card, Field, Textarea } from '../components.js';

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

interface Props {
  settings: Settings;
}

export function GenerateTab({ settings }: Props) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [patch, setPatch] = useState<GeneratedPatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);

  useEffect(() => {
    void getActiveTab().then(setTab);
  }, []);

  const tokens = estimateTokens(prompt);
  const costUsd = (tokens / 1000) * 0.04;
  const domain = tab?.url ? new URL(tab.url).hostname : '';
  const allowed = isDomainAllowed(settings.domainRules, domain);

  const generate = useCallback(async () => {
    setError(null);
    setNotice(null);
    setPatch(null);
    if (!tab?.id || !tab.url) return setError('Нет активной вкладки');
    if (!allowed) return setError(`Домен ${domain} запрещён правилами в настройках.`);

    const cap = await checkSpendCap(settings.spendCap, costUsd);
    if (!cap.ok) return setError(cap.reason);

    if (settings.confirmBeforeGenerate) {
      const ok = window.confirm(`Сгенерировать патч (~${tokens} токенов, ~$${costUsd.toFixed(3)})?`);
      if (!ok) return;
    }

    setBusy(true);
    try {
      const snapshot = await requestSnapshot(tab.id);
      const byok = await getByokKey();
      const res = await fetch(`${settings.apiBase}/api/v1/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          snapshot,
          model: settings.model,
          ...(byok ? { byokKey: byok.apiKey, byokProvider: byok.provider } : {}),
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = (await res.json()) as {
        patch: GeneratedPatch;
        tokensUsed?: number;
        costUsd?: number;
      };
      setPatch(data.patch);
      await recordSpend(data.costUsd ?? costUsd);
      await pushHistory({
        domain,
        prompt,
        patchDescription: data.patch.description,
        tokensUsed: data.tokensUsed ?? tokens,
        costUsd: data.costUsd ?? costUsd,
        model: settings.model,
        applied: false,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [prompt, tab, settings, allowed, costUsd, domain, tokens]);

  const apply = useCallback(async () => {
    if (!patch || !tab?.id || !tab.url) return;
    const dom = new URL(tab.url).hostname;
    const now = new Date().toISOString();
    const p: Patch = {
      id: crypto.randomUUID(),
      domain: dom,
      name: patch.description.slice(0, 60) || 'Untitled patch',
      description: patch.description,
      css: patch.css,
      js: patch.js,
      affectedSelectors: patch.affectedSelectors,
      enabled: true,
      version: 0,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };
    await putPatch(p);
    chrome.tabs.sendMessage(tab.id, { kind: 'patch.apply', tabId: tab.id, patch: p });
    setPatch(null);
    setPrompt('');
    setNotice('Патч применён и сохранён ✓');
  }, [patch, tab]);

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !busy && prompt.length >= 3) {
      e.preventDefault();
      void generate();
    }
  };

  return (
    <div className="vl-stack">
      <Card>
        <Field
          label={`Что изменить на ${domain || 'этом сайте'}?`}
          help={
            <>
              <span className="vl-kbd">Ctrl/⌘+Enter</span> — сгенерировать. Будьте конкретны: цвета, селекторы, размеры.
            </>
          }
        >
          <Textarea
            placeholder='Например: «Скрой блок рекламы, сделай заголовки на 20% больше и тёмную тему»'
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKey}
            autoFocus
          />
        </Field>
        <div className="vl-row" style={{ marginTop: 10 }}>
          <span className="vl-est">
            ~{tokens} токенов · <span className="vl-est-cost">${costUsd.toFixed(3)}</span> · {settings.model}
          </span>
          <button
            className="vl-btn"
            disabled={busy || prompt.length < 3 || !allowed}
            onClick={generate}
          >
            {busy ? 'Генерация…' : 'Generate'}
          </button>
        </div>
        {!allowed && (
          <div className="vl-help" style={{ color: 'var(--warn)', marginTop: 6 }}>
            Этот домен заблокирован настройками. Включи или поменяй правило во вкладке Settings.
          </div>
        )}
      </Card>

      {error && <div className="vl-error">{error}</div>}
      {notice && <div className="vl-ok">{notice}</div>}

      {patch && (
        <Card title="Превью">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{patch.description}</div>
          <div className="vl-preview">
            {patch.css && `/* CSS */\n${patch.css}`}
            {patch.css && patch.js && '\n\n'}
            {patch.js && `/* JS */\n${patch.js}`}
          </div>
          <div className="vl-row" style={{ marginTop: 10 }}>
            <button className="vl-btn vl-btn--ghost" onClick={() => setPatch(null)}>
              Отклонить
            </button>
            <button className="vl-btn" onClick={apply}>
              Применить и сохранить
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
