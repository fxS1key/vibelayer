// My Patches tab — list, search, toggle enabled, delete, resolve conflicts.

import { useEffect, useMemo, useState } from 'react';
import type { Patch } from '@vibelayer/shared';
import { deletePatch, getAllPatches, putPatch } from '../../storage.js';
import { Empty, Input } from '../components.js';
import { t } from '../../i18n.js';

export function PatchesTab() {
  const [patches, setPatches] = useState<Patch[]>([]);
  const [q, setQ] = useState('');

  const reload = async () => {
    const all = await getAllPatches();
    setPatches(all.filter((p) => !p.isDeleted));
  };

  useEffect(() => {
    void reload();
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return patches;
    const needle = q.toLowerCase();
    return patches.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        p.domain.toLowerCase().includes(needle) ||
        p.description.toLowerCase().includes(needle),
    );
  }, [patches, q]);

  const conflicts = useMemo(() => patches.filter((p) => p.conflictedRemote), [patches]);

  const toggleEnabled = async (p: Patch) => {
    await putPatch({ ...p, enabled: !p.enabled, updatedAt: new Date().toISOString() });
    await reload();
  };

  const onDelete = async (p: Patch) => {
    if (!confirm(t('patches.deleteConfirm', { name: p.name }))) return;
    await deletePatch(p.id);
    await reload();
  };

  const keepLocal = async (p: Patch) => {
    const { conflictedRemote: _drop, ...rest } = p;
    void _drop;
    await putPatch({ ...rest, updatedAt: new Date().toISOString() }, { markDirty: true });
    await reload();
  };

  const takeRemote = async (p: Patch) => {
    if (!p.conflictedRemote) return;
    const { conflictedRemote: remote, ...rest } = p;
    await putPatch(
      { ...rest, css: remote.css, js: remote.js, updatedAt: new Date().toISOString() },
      { markDirty: true },
    );
    await reload();
  };

  if (patches.length === 0) {
    return <Empty>Пока нет сохранённых патчей. Создай первый во вкладке Generate.</Empty>;
  }

  return (
    <div className="vl-stack">
      {conflicts.length > 0 && (
        <div className="vl-stack" style={{ marginBottom: 12 }}>
          <div className="vl-label" style={{ color: 'var(--warn)' }}>
            {t('patches.conflictsHeader', { n: conflicts.length })}
          </div>
          {conflicts.map((p) => (
            <div key={`conflict-${p.id}`} className="vl-list-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div className="vl-list-title">{p.name}</div>
              <div className="vl-list-sub" style={{ marginBottom: 8 }}>
                {t('patches.conflictDescription', { domain: p.domain })}
              </div>
              <div className="vl-row" style={{ gap: 8 }}>
                <button className="vl-btn vl-btn--sm" onClick={() => keepLocal(p)}>
                  {t('patches.keepLocal')}
                </button>
                <button className="vl-btn vl-btn--sm vl-btn--ghost" onClick={() => takeRemote(p)}>
                  {t('patches.takeRemote')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="vl-search">
        <Input
          placeholder="Поиск по имени, домену…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="vl-list">
        {filtered.map((p) => (
          <div key={p.id} className="vl-list-item">
            <div className="vl-list-text">
              <div className="vl-list-title">
                {p.name}
                {p.conflictedRemote && (
                  <span
                    style={{ marginLeft: 6, color: 'var(--warn)', fontSize: 11 }}
                    title="Конфликт синхронизации"
                  >
                    ⚠ конфликт
                  </span>
                )}
              </div>
              <div className="vl-list-sub">
                {p.domain} · {new Date(p.updatedAt).toLocaleDateString()}
              </div>
            </div>
            <button
              role="switch"
              aria-checked={p.enabled}
              className="vl-toggle"
              onClick={() => toggleEnabled(p)}
              title={p.enabled ? 'Включён' : 'Выключен'}
            />
            <button
              className="vl-btn vl-btn--icon"
              onClick={() => onDelete(p)}
              title="Удалить"
              aria-label="Delete"
            >
              ✕
            </button>
          </div>
        ))}
        {filtered.length === 0 && <Empty>Ничего не найдено.</Empty>}
      </div>
    </div>
  );
}
