// User-facing settings + history. Persisted in chrome.storage.local so they
// survive the service-worker termination cycle. Schema is versioned via the
// `_v` field — bump it when changing shape and add a migration step.

export type Theme = 'light' | 'dark' | 'system';
export type LlmModel =
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-7'
  | 'claude-haiku-4-5-20251001'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'gemini-1.5-pro';

export interface Byok {
  provider: 'anthropic' | 'openai';
  apiKey: string;
}

export interface DomainRules {
  // "blacklist" → block everywhere except listed; "whitelist" → allow only listed; "off" → no rules.
  mode: 'off' | 'blacklist' | 'whitelist';
  domains: string[]; // bare hostnames, e.g. "mail.google.com"
}

export interface SpendCap {
  enabled: boolean;
  dailyUsd: number;
  monthlyUsd: number;
}

export interface Hotkeys {
  // Stored for in-page handling. The chrome.commands shortcuts are configured
  // in manifest + chrome://extensions/shortcuts; this is for the panel UI only.
  generate: string; // default "Ctrl+Enter"
  closePanel: string; // default "Escape"
}

export interface Settings {
  _v: 1;
  theme: Theme;
  model: LlmModel;
  apiBase: string;
  byok: Byok | null;
  autoApply: boolean; // re-apply saved patches on page load
  confirmBeforeGenerate: boolean;
  spendCap: SpendCap;
  domainRules: DomainRules;
  hotkeys: Hotkeys;
}

export const DEFAULT_SETTINGS: Settings = {
  _v: 1,
  theme: 'system',
  model: 'claude-sonnet-4-6',
  apiBase: 'https://api.vibelayer.io',
  byok: null,
  autoApply: true,
  confirmBeforeGenerate: false,
  spendCap: { enabled: false, dailyUsd: 1, monthlyUsd: 20 },
  domainRules: { mode: 'off', domains: [] },
  hotkeys: { generate: 'Ctrl+Enter', closePanel: 'Escape' },
};

const KEY = 'settings';

export async function getSettings(): Promise<Settings> {
  const data = await chrome.storage.local.get(KEY);
  const s = data[KEY] as Settings | undefined;
  if (!s) return DEFAULT_SETTINGS;
  // Merge so newly added fields get defaults without losing user values.
  return { ...DEFAULT_SETTINGS, ...s };
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export async function resetSettings(): Promise<Settings> {
  await chrome.storage.local.set({ [KEY]: DEFAULT_SETTINGS });
  return DEFAULT_SETTINGS;
}

// -------- Domain rules ----------

export function isDomainAllowed(rules: DomainRules, domain: string): boolean {
  if (rules.mode === 'off') return true;
  const inList = rules.domains.some(
    (d) => d === domain || domain.endsWith('.' + d.replace(/^\./, '')),
  );
  return rules.mode === 'whitelist' ? inList : !inList;
}

// -------- Spend cap ----------

const SPEND_KEY = 'spendLedger';
interface SpendEntry {
  ts: number; // epoch ms
  usd: number;
}

export async function recordSpend(usd: number): Promise<void> {
  const data = await chrome.storage.local.get(SPEND_KEY);
  const ledger: SpendEntry[] = (data[SPEND_KEY] as SpendEntry[] | undefined) ?? [];
  ledger.push({ ts: Date.now(), usd });
  // Keep only last 60 days — sliding window.
  const cutoff = Date.now() - 60 * 24 * 3600 * 1000;
  const trimmed = ledger.filter((e) => e.ts >= cutoff);
  await chrome.storage.local.set({ [SPEND_KEY]: trimmed });
}

export async function getSpend(): Promise<{ day: number; month: number }> {
  const data = await chrome.storage.local.get(SPEND_KEY);
  const ledger: SpendEntry[] = (data[SPEND_KEY] as SpendEntry[] | undefined) ?? [];
  const now = new Date();
  // Day starts at local midnight; month at the 1st. Users expect "monthly"
  // limits to reset on the 1st, not on a 30-day sliding window.
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return {
    day: ledger.filter((e) => e.ts >= dayStart).reduce((s, e) => s + e.usd, 0),
    month: ledger.filter((e) => e.ts >= monthStart).reduce((s, e) => s + e.usd, 0),
  };
}

export async function checkSpendCap(
  cap: SpendCap,
  estimatedUsd: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!cap.enabled) return { ok: true };
  const { t } = await import('./i18n.js');
  const { day, month } = await getSpend();
  if (day + estimatedUsd > cap.dailyUsd)
    return { ok: false, reason: t('cap.day.exceeded', { cap: cap.dailyUsd, spent: day.toFixed(3) }) };
  if (month + estimatedUsd > cap.monthlyUsd)
    return { ok: false, reason: t('cap.month.exceeded', { cap: cap.monthlyUsd, spent: month.toFixed(2) }) };
  return { ok: true };
}

// -------- History ----------

export interface HistoryEntry {
  id: string;
  domain: string;
  prompt: string;
  patchDescription: string;
  tokensUsed: number;
  costUsd: number;
  model: string;
  ts: number;
  applied: boolean;
}

const HISTORY_KEY = 'history';
const HISTORY_LIMIT = 100;

export async function pushHistory(entry: Omit<HistoryEntry, 'id' | 'ts'>): Promise<void> {
  const data = await chrome.storage.local.get(HISTORY_KEY);
  const list: HistoryEntry[] = (data[HISTORY_KEY] as HistoryEntry[] | undefined) ?? [];
  list.unshift({ ...entry, id: crypto.randomUUID(), ts: Date.now() });
  if (list.length > HISTORY_LIMIT) list.length = HISTORY_LIMIT;
  await chrome.storage.local.set({ [HISTORY_KEY]: list });
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const data = await chrome.storage.local.get(HISTORY_KEY);
  return (data[HISTORY_KEY] as HistoryEntry[] | undefined) ?? [];
}

export async function clearHistory(): Promise<void> {
  await chrome.storage.local.remove(HISTORY_KEY);
}
