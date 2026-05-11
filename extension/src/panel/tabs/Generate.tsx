// Generate tab — the main flow: prompt → estimate → generate → preview → apply.

import { useCallback, useEffect, useState } from 'react';
import { GeneratedPatchSchema, type GeneratedPatch, type Patch } from '@vibelayer/shared';
import { getByokKey } from '../../byok.js';
import { callLlmDirect } from '../../llm-direct.js';
import { putPatch } from '../../storage.js';
import { verifyPatchSignature } from '../../verify.js';
import { t } from '../../i18n.js';
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
    if (!tab?.id || !tab.url) return setError(t('tab.generate.empty'));
    if (!allowed) return setError(t('tab.generate.domainBlocked', { domain }));

    const cap = await checkSpendCap(settings.spendCap, costUsd);
    if (!cap.ok) return setError(cap.reason);

    if (settings.confirmBeforeGenerate) {
      const ok = window.confirm(t('tab.generate.confirm', { tokens, cost: costUsd.toFixed(3) }));
      if (!ok) return;
    }

    setBusy(true);
    try {
      const snapshot = (await requestSnapshot(tab.id)) as { html?: string } | undefined;
      const byok = await getByokKey();

      let generated: GeneratedPatch;
      let tokensUsed: number;
      let actualCost: number;

      if (byok) {
        // True BYOK: call the provider directly. No VibeLayer server in the loop.
        const result = await callLlmDirect({
          provider: byok.provider,
          apiKey: byok.apiKey,
          model: settings.model,
          prompt,
          domain,
          url: tab.url,
          html: snapshot?.html ?? '',
        });
        const parsed = GeneratedPatchSchema.safeParse(result.patch);
        if (!parsed.success) throw new Error(`LLM returned malformed patch: ${parsed.error.message}`);
        generated = parsed.data;
        tokensUsed = result.tokensIn + result.tokensOut;
        actualCost = result.costUsd;
      } else {
        const res = await fetch(`${settings.apiBase}/api/v1/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, snapshot, model: settings.model }),
        });
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = (await res.json()) as {
          patch: unknown;
          signature?: string;
          tokensUsed?: number;
          costUsd?: number;
        };
        const parsed = GeneratedPatchSchema.safeParse(data.patch);
        if (!parsed.success) throw new Error(`API returned malformed patch: ${parsed.error.message}`);
        const ok = await verifyPatchSignature(parsed.data, data.signature);
        if (!ok) throw new Error(t('tab.generate.signatureFailed'));
        generated = parsed.data;
        tokensUsed = data.tokensUsed ?? tokens;
        actualCost = data.costUsd ?? costUsd;
      }

      setPatch(generated);
      await recordSpend(actualCost);
      await pushHistory({
        domain,
        prompt,
        patchDescription: generated.description,
        tokensUsed,
        costUsd: actualCost,
        model: settings.model,
        applied: false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
    setNotice(t('tab.generate.applied'));
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
