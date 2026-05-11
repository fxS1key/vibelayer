// Bring Your Own Key. The user pastes their own Anthropic / OpenAI key; we
// store it in chrome.storage.local (encrypted-at-rest by the browser). When a
// BYOK key is configured, generation calls the provider directly from the
// extension (see llm-direct.ts) — the VibeLayer server is NOT involved, so
// your key and prompts never touch our infrastructure.
//
// Important: the key never lands in IndexedDB or in any sync payload. It is
// device-local by design — a user with BYOK on two devices configures each
// separately, which is fine because the keys are cheap and revocable.

const KEY_STORE = 'byok';

export interface ByokConfig {
  provider: 'anthropic' | 'openai';
  apiKey: string;
}

function looksLikeKey(provider: 'anthropic' | 'openai', key: string): boolean {
  if (key.length < 20) return false;
  if (provider === 'anthropic') return key.startsWith('sk-ant-');
  return key.startsWith('sk-');
}

export async function setByokKey(cfg: ByokConfig): Promise<void> {
  const trimmed = cfg.apiKey.trim();
  if (!looksLikeKey(cfg.provider, trimmed)) {
    const { t } = await import('./i18n.js');
    const expected = t(cfg.provider === 'anthropic' ? 'byok.anthropicPrefix' : 'byok.openaiPrefix');
    throw new Error(t('byok.invalid', { expected }));
  }
  await chrome.storage.local.set({ [KEY_STORE]: { ...cfg, apiKey: trimmed } });
}

export async function getByokKey(): Promise<ByokConfig | null> {
  const data = await chrome.storage.local.get(KEY_STORE);
  return (data[KEY_STORE] as ByokConfig | undefined) ?? null;
}

export async function clearByokKey(): Promise<void> {
  await chrome.storage.local.remove(KEY_STORE);
}

// Optional online check the Settings tab can call after save. Cheap GETs that
// exercise auth without spending real tokens. Returns null on success or a
// human-readable error.
export async function verifyByokKey(cfg: ByokConfig): Promise<string | null> {
  try {
    if (cfg.provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      });
      if (r.status === 401 || r.status === 403) return 'Key was rejected by Anthropic.';
      if (!r.ok) return `Anthropic returned ${r.status}.`;
      return null;
    }
    const r = await fetch('https://api.openai.com/v1/models', {
      headers: { authorization: `Bearer ${cfg.apiKey}` },
    });
    if (r.status === 401 || r.status === 403) return 'Key was rejected by OpenAI.';
    if (!r.ok) return `OpenAI returned ${r.status}.`;
    return null;
  } catch (e) {
    return `Network error: ${e instanceof Error ? e.message : String(e)}`;
  }
}
