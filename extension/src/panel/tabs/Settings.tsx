// Settings tab. Sections: Appearance, LLM, BYOK, Domains, Spend cap,
// Behaviour, Patches (export/import), Hotkeys, About.

import { useEffect, useState } from 'react';
import { clearByokKey, getByokKey, setByokKey } from '../../byok.js';
import {
  DEFAULT_SETTINGS,
  getSpend,
  resetSettings,
  setSettings as saveSettings,
  type Settings,
  type LlmModel,
} from '../../settings.js';
import { deletePatch, getAllPatches, putPatch } from '../../storage.js';
import { PatchSchema } from '@vibelayer/shared';
import { t } from '../../i18n.js';
import { Card, Field, Input, Select, Toggle } from '../components.js';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
}

const MODELS: { value: LlmModel; label: string; hint: string }[] = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', hint: 'Рекомендую. Баланс цены и качества.' },
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7', hint: 'Дороже, лучше для сложных селекторов.' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', hint: 'Дёшево и быстро.' },
  { value: 'gpt-4o', label: 'GPT-4o', hint: 'Альтернатива от OpenAI.' },
  { value: 'gpt-4o-mini', label: 'GPT-4o mini', hint: 'Самый дешёвый OpenAI.' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', hint: 'Google. Большое контекстное окно.' },
];

export function SettingsTab({ settings, onChange }: Props) {
  const [byokInput, setByokInput] = useState('');
  const [byokProvider, setByokProvider] = useState<'anthropic' | 'openai'>('anthropic');
  const [byokSaved, setByokSaved] = useState<boolean>(false);
  const [domainsText, setDomainsText] = useState(settings.domainRules.domains.join('\n'));
  const [spend, setSpend] = useState({ day: 0, month: 0 });

  useEffect(() => {
    void getByokKey().then((k) => {
      setByokSaved(!!k);
      if (k) setByokProvider(k.provider);
    });
    void getSpend().then(setSpend);
  }, []);

  const patch = async (p: Partial<Settings>) => {
    onChange(await saveSettings(p));
  };

  const onSaveByok = async () => {
    if (!byokInput.trim()) return;
    try {
      await setByokKey({ provider: byokProvider, apiKey: byokInput.trim() });
      setByokInput('');
      setByokSaved(true);
    } catch (e) {
      alert(String(e));
    }
  };

  const onClearByok = async () => {
    await clearByokKey();
    setByokSaved(false);
  };

  const exportAll = async () => {
    const all = await getAllPatches();
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vibelayer-patches-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importAll = async (file: File) => {
    const text = await file.text();
    try {
      const raw = JSON.parse(text);
      if (!Array.isArray(raw)) throw new Error(t('import.expectsArray'));
      let ok = 0;
      let skipped = 0;
      for (const p of raw) {
        const parsed = PatchSchema.safeParse(p);
        if (parsed.success) {
          await putPatch(parsed.data, { markDirty: true });
          ok++;
        } else {
          skipped++;
        }
      }
      alert(skipped > 0 ? t('import.resultWithSkipped', { ok, skipped }) : t('import.result', { ok }));
    } catch (e) {
      alert(t('import.error', { msg: e instanceof Error ? e.message : String(e) }));
    }
  };

  const deleteAll = async () => {
    if (!confirm('Удалить ВСЕ сохранённые патчи? Это нельзя отменить.')) return;
    for (const p of await getAllPatches()) await deletePatch(p.id);
    alert('Готово.');
  };

  return (
    <div className="vl-stack">
      {/* Appearance */}
      <Card title="Внешний вид">
        <Field label="Тема">
          <Select
            value={settings.theme}
            onChange={(e) => patch({ theme: e.target.value as Settings['theme'] })}
          >
            <option value="system">Системная</option>
            <option value="dark">Тёмная</option>
            <option value="light">Светлая</option>
          </Select>
        </Field>
      </Card>

      {/* LLM */}
      <Card title="Модель и API">
        <div className="vl-stack">
          <Field label="LLM модель" help={MODELS.find((m) => m.value === settings.model)?.hint}>
            <Select
              value={settings.model}
              onChange={(e) => patch({ model: e.target.value as LlmModel })}
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="API endpoint"
            help="https://api.vibelayer.io — облако. http://localhost:8080 — self-host."
          >
            <Input
              className="vl-input--mono"
              value={settings.apiBase}
              onChange={(e) => patch({ apiBase: e.target.value })}
              placeholder="https://api.vibelayer.io"
            />
          </Field>
        </div>
      </Card>

      {/* BYOK */}
      <Card title="Свой ключ (BYOK)">
        <div className="vl-help" style={{ marginBottom: 8 }}>
          {byokSaved
            ? `Ключ сохранён (${byokProvider}). Запросы идут напрямую — VibeLayer не списывает токены.`
            : 'Вставь свой ключ Anthropic или OpenAI — будешь платить напрямую им, минуя нас.'}
        </div>
        <div className="vl-stack">
          <Select
            value={byokProvider}
            onChange={(e) => setByokProvider(e.target.value as 'anthropic' | 'openai')}
          >
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI (GPT)</option>
          </Select>
          <Input
            className="vl-input--mono"
            type="password"
            placeholder="sk-ant-… или sk-…"
            value={byokInput}
            onChange={(e) => setByokInput(e.target.value)}
          />
          <div className="vl-row vl-row--end">
            {byokSaved && (
              <button className="vl-btn vl-btn--ghost vl-btn--sm" onClick={onClearByok}>
                Удалить ключ
              </button>
            )}
            <button className="vl-btn vl-btn--sm" onClick={onSaveByok} disabled={byokInput.length < 10}>
              Сохранить
            </button>
          </div>
        </div>
      </Card>

      {/* Behaviour */}
      <Card title="Поведение">
        <div className="vl-stack">
          <Toggle
            label="Авто-применение патчей при загрузке"
            checked={settings.autoApply}
            onChange={(autoApply) => patch({ autoApply })}
          />
          <Toggle
            label="Подтверждать перед Generate"
            checked={settings.confirmBeforeGenerate}
            onChange={(confirmBeforeGenerate) => patch({ confirmBeforeGenerate })}
          />
        </div>
      </Card>

      {/* Spend cap */}
      <Card title="Лимиты трат">
        <Toggle
          label="Включить жёсткие лимиты"
          checked={settings.spendCap.enabled}
          onChange={(enabled) => patch({ spendCap: { ...settings.spendCap, enabled } })}
        />
        {settings.spendCap.enabled && (
          <div className="vl-stack" style={{ marginTop: 8 }}>
            <Field label="Дневной лимит, $">
              <Input
                type="number"
                step="0.10"
                min="0"
                value={settings.spendCap.dailyUsd}
                onChange={(e) =>
                  patch({
                    spendCap: { ...settings.spendCap, dailyUsd: Number(e.target.value) },
                  })
                }
              />
            </Field>
            <Field label="Месячный лимит, $">
              <Input
                type="number"
                step="1"
                min="0"
                value={settings.spendCap.monthlyUsd}
                onChange={(e) =>
                  patch({
                    spendCap: { ...settings.spendCap, monthlyUsd: Number(e.target.value) },
                  })
                }
              />
            </Field>
            <div className="vl-help">
              Сейчас потрачено: <strong>${spend.day.toFixed(3)}</strong> за день,{' '}
              <strong>${spend.month.toFixed(2)}</strong> за 30 дней.
            </div>
          </div>
        )}
      </Card>

      {/* Domains */}
      <Card title="Домены">
        <Field
          label="Режим"
          help="Whitelist — расширение работает ТОЛЬКО на указанных доменах. Blacklist — НЕ работает на указанных."
        >
          <Select
            value={settings.domainRules.mode}
            onChange={(e) =>
              patch({
                domainRules: {
                  ...settings.domainRules,
                  mode: e.target.value as Settings['domainRules']['mode'],
                },
              })
            }
          >
            <option value="off">Без ограничений</option>
            <option value="blacklist">Blacklist</option>
            <option value="whitelist">Whitelist</option>
          </Select>
        </Field>
        {settings.domainRules.mode !== 'off' && (
          <Field label="Список доменов (по одному на строку)">
            <textarea
              className="vl-textarea vl-input--mono"
              rows={4}
              value={domainsText}
              placeholder="mail.google.com&#10;bank.example.com"
              onChange={(e) => setDomainsText(e.target.value)}
              onBlur={() =>
                patch({
                  domainRules: {
                    ...settings.domainRules,
                    domains: domainsText
                      .split('\n')
                      .map((d) => d.trim())
                      .filter(Boolean),
                  },
                })
              }
            />
          </Field>
        )}
      </Card>

      {/* Patches export/import */}
      <Card title="Экспорт / Импорт патчей">
        <div className="vl-stack">
          <button className="vl-btn vl-btn--ghost" onClick={exportAll}>
            Скачать все патчи (JSON)
          </button>
          <label className="vl-btn vl-btn--ghost" style={{ cursor: 'pointer' }}>
            Импортировать из JSON…
            <input
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importAll(f);
              }}
            />
          </label>
          <button className="vl-btn vl-btn--danger vl-btn--sm" onClick={deleteAll}>
            Удалить все патчи
          </button>
        </div>
      </Card>

      {/* Hotkeys */}
      <Card title="Горячие клавиши">
        <div className="vl-stack">
          <div className="vl-help">
            <div>Открыть popup: <span className="vl-kbd">Ctrl/⌘+Shift+V</span></div>
            <div>Открыть side panel: <span className="vl-kbd">Ctrl/⌘+Shift+L</span></div>
            <div>Сгенерировать: <span className="vl-kbd">Ctrl/⌘+Enter</span></div>
            <div>Закрыть: <span className="vl-kbd">Esc</span></div>
          </div>
          <button
            className="vl-btn vl-btn--ghost vl-btn--sm"
            onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
          >
            Изменить системные шорткаты…
          </button>
        </div>
      </Card>

      {/* About */}
      <Card title="О расширении">
        <div className="vl-help">
          VibeLayer · v{chrome.runtime.getManifest().version} · MIT
        </div>
        <div className="vl-row" style={{ marginTop: 8 }}>
          <button
            className="vl-btn vl-btn--ghost vl-btn--sm"
            onClick={async () => {
              if (confirm('Сбросить все настройки к дефолтам?')) {
                const s = await resetSettings();
                onChange(s);
              }
            }}
          >
            Сбросить настройки
          </button>
          <span className="vl-help" style={{ marginLeft: 'auto' }}>
            v{DEFAULT_SETTINGS._v} schema
          </span>
        </div>
      </Card>
    </div>
  );
}
