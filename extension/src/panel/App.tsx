// Root App. Shared between popup and side panel — pass `mode` to adjust sizing.
// Owns: theme application, tab state, settings load/save, "expand to panel"
// action from popup.

import { useCallback, useEffect, useState } from 'react';
import { getSettings, type Settings } from '../settings.js';
import { GenerateTab } from './tabs/Generate.js';
import { PatchesTab } from './tabs/Patches.js';
import { HistoryTab } from './tabs/History.js';
import { SettingsTab } from './tabs/Settings.js';

type TabKey = 'generate' | 'patches' | 'history' | 'settings';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'generate', label: 'Generate' },
  { key: 'patches', label: 'My Patches' },
  { key: 'history', label: 'History' },
  { key: 'settings', label: 'Settings' },
];

function applyTheme(theme: Settings['theme']): void {
  const root = document.documentElement;
  const resolved =
    theme === 'system'
      ? matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : theme;
  root.dataset.theme = resolved;
}

interface Props {
  mode: 'popup' | 'panel';
}

export function App({ mode }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tab, setTab] = useState<TabKey>('generate');
  const [reusePrompt, setReusePrompt] = useState<string | null>(null);

  useEffect(() => {
    void getSettings().then((s) => {
      setSettings(s);
      applyTheme(s.theme);
    });
  }, []);

  useEffect(() => {
    if (settings) applyTheme(settings.theme);
  }, [settings?.theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mode === 'popup') window.close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  const openSidePanel = useCallback(() => {
    chrome.runtime.sendMessage({ kind: 'open.side-panel' });
    if (mode === 'popup') setTimeout(() => window.close(), 100);
  }, [mode]);

  if (!settings) return <div className="vl-app"><div className="vl-empty">Загрузка…</div></div>;

  return (
    <div className={`vl-app ${mode === 'popup' ? 'vl-app--popup' : ''}`}>
      <header className="vl-header">
        <div className="vl-logo" />
        <div className="vl-title">VibeLayer</div>
        <div className="vl-header-actions">
          {mode === 'popup' && (
            <button
              className="vl-btn vl-btn--icon"
              onClick={openSidePanel}
              title="Открыть в side panel"
              aria-label="Expand to side panel"
            >
              ⛶
            </button>
          )}
          <button
            className="vl-btn vl-btn--icon"
            onClick={() => setTab('settings')}
            title="Настройки"
            aria-label="Settings"
          >
            ⚙
          </button>
        </div>
      </header>

      <nav className="vl-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className="vl-tab"
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="vl-body">
        {tab === 'generate' && (
          <GenerateTab
            key={reusePrompt ?? 'fresh'}
            settings={settings}
          />
        )}
        {tab === 'patches' && <PatchesTab />}
        {tab === 'history' && (
          <HistoryTab
            onReuse={(p) => {
              setReusePrompt(p);
              setTab('generate');
            }}
          />
        )}
        {tab === 'settings' && <SettingsTab settings={settings} onChange={setSettings} />}
      </main>
    </div>
  );
}
