// Tiny i18n: pick the active locale from chrome.i18n (or `navigator.language`
// in non-extension contexts) and look up a key. Fallback chain is
// active-locale → en. Interpolation: t('cap.day', { usd: 1.23 }) replaces
// {usd} in the template.
//
// We don't ship the full Chrome _locales/ system because the dictionaries are
// small and we want the same module to work in popup, side panel, and content
// scripts without re-loading messages.json each time.

type Vars = Record<string, string | number>;

const en = {
  'tab.generate.empty': 'No active tab',
  'tab.generate.domainBlocked': 'Domain {domain} is blocked by your rules.',
  'tab.generate.confirm': 'Generate patch (~{tokens} tokens, ~${cost})?',
  'tab.generate.applied': 'Patch applied and saved ✓',
  'tab.generate.signatureFailed': 'Patch signature failed verification — rejected.',
  'tab.generate.modelMalformed': 'LLM returned a malformed patch.',
  'cap.day.exceeded': 'Daily cap ${cap} exceeded (${spent} already spent).',
  'cap.month.exceeded': 'Monthly cap ${cap} exceeded (${spent} already spent).',
  'byok.invalid': 'API key looks invalid (expected {expected}).',
  'byok.anthropicPrefix': '"sk-ant-…"',
  'byok.openaiPrefix': '"sk-…"',
  'patches.deleteConfirm': 'Delete patch "{name}"?',
  'patches.conflictsHeader': 'Sync conflicts ({n})',
  'patches.conflictDescription': '{domain} · this patch was edited on two devices at once',
  'patches.keepLocal': 'Keep local',
  'patches.takeRemote': 'Take remote',
  'import.expectsArray': 'Expected an array of patches',
  'import.result': 'Imported: {ok}',
  'import.resultWithSkipped': 'Imported: {ok}, skipped invalid: {skipped}',
  'import.error': 'Import error: {msg}',
} as const;

type Key = keyof typeof en;

const ru: Partial<Record<Key, string>> = {
  'tab.generate.empty': 'Нет активной вкладки',
  'tab.generate.domainBlocked': 'Домен {domain} запрещён правилами в настройках.',
  'tab.generate.confirm': 'Сгенерировать патч (~{tokens} токенов, ~${cost})?',
  'tab.generate.applied': 'Патч применён и сохранён ✓',
  'tab.generate.signatureFailed': 'Подпись патча не прошла проверку — патч отклонён.',
  'tab.generate.modelMalformed': 'LLM вернул некорректный патч.',
  'cap.day.exceeded': 'Дневной лимит ${cap} превышен (потрачено ${spent}).',
  'cap.month.exceeded': 'Месячный лимит ${cap} превышен (потрачено ${spent}).',
  'byok.invalid': 'API key выглядит некорректно (ожидается {expected}).',
  'byok.anthropicPrefix': '«sk-ant-…»',
  'byok.openaiPrefix': '«sk-…»',
  'patches.deleteConfirm': 'Удалить патч «{name}»?',
  'patches.conflictsHeader': 'Конфликты синхронизации ({n})',
  'patches.conflictDescription': '{domain} · этот патч изменился на двух устройствах одновременно',
  'patches.keepLocal': 'Оставить локальный',
  'patches.takeRemote': 'Взять удалённый',
  'import.expectsArray': 'Ожидается массив патчей',
  'import.result': 'Импортировано: {ok}',
  'import.resultWithSkipped': 'Импортировано: {ok}, пропущено невалидных: {skipped}',
  'import.error': 'Ошибка импорта: {msg}',
};

const dictionaries: Record<string, Partial<Record<Key, string>>> = { en, ru };

function activeLang(): string {
  try {
    const ui = chrome?.i18n?.getUILanguage?.();
    if (ui) return ui.slice(0, 2);
  } catch {
    // not in an extension context (e.g. tests)
  }
  const nav = (globalThis as { navigator?: { language?: string } }).navigator;
  return nav?.language?.slice(0, 2) ?? 'en';
}

export function t(key: Key, vars?: Vars): string {
  const lang = activeLang();
  const template = dictionaries[lang]?.[key] ?? en[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const v = vars[name];
    return v === undefined ? `{${name}}` : String(v);
  });
}
