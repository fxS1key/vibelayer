// My Patches tab — list, search, toggle enabled, delete.

import { useEffect, useMemo, useState } from 'react';
import type { Patch } from '@vibelayer/shared';
import { deletePatch, getAllPatches, putPatch } from '../../storage.js';
import { Empty, Input } from '../components.js';

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

  const toggleEnabled = async (p: Patch) => {
    await putPatch({ ...p, enabled: !p.enabled, updatedAt: new Date().toISOString() });
    await reload();
  };

  const onDelete = async (p: Patch) => {
    if (!confirm(`Удалить патч «${p.name}»?`)) return;
    await deletePatch(p.id);
    await reload();
  };

  if (patches.length === 0) {
    return <Empty>Пока нет сохранённых патчей. Создай первый во вкладке Generate.</Empty>;
  }

  return (
    <div className="vl-stack">
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
              <div className="vl-list-title">{p.name}</div>
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
