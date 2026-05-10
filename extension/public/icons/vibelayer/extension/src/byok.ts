// Bring Your Own Key. The user pastes their own Anthropic / OpenAI key; we
// store it in chrome.storage.local (encrypted-at-rest by the browser) and
// forward it on each /generate call. The server uses it instead of charging
// the user's VibeLayer balance.
//
// Important: the key never lands in IndexedDB or in any sync payload. It is
// device-local by design — a user with BYOK on two devices configures each
// separately, which is fine because the keys are cheap and revocable.

const KEY_STORE = 'byok';

export interface ByokConfig {
  provider: 'anthropic' | 'openai';
  apiKey: string;
}

export async function setByokKey(cfg: ByokConfig): Promise<void> {
  if (!cfg.apiKey.startsWith('sk-')) {
    throw new Error('API key looks invalid (expected to start with "sk-")');
  }
  await chrome.storage.local.set({ [KEY_STORE]: cfg });
}

export async function getByokKey(): Promise<ByokConfig | null> {
  const data = await chrome.storage.local.get(KEY_STORE);
  return (data[KEY_STORE] as ByokConfig | undefined) ?? null;
}

export async function clearByokKey(): Promise<void> {
  await chrome.storage.local.remove(KEY_STORE);
}
