// History tab — last 100 generations, with re-run.

import { useEffect, useState } from 'react';
import { clearHistory, getHistory, type HistoryEntry } from '../../settings.js';
import { Empty } from '../components.js';

interface Props {
  onReuse: (prompt: string) => void;
}

export function HistoryTab({ onReuse }: Props) {
  const [list, setList] = useState<HistoryEntry[]>([]);

  const reload = async () => setList(await getHistory());
  useEffect(() => {
    void reload();
  }, []);

  if (list.length === 0) {
    return <Empty>История пуста. Каждый запрос будет показан здесь.</Empty>;
  }

  return (
    <div className="vl-stack">
      <div className="vl-row">
        <span className="vl-label">Последние {list.length} запросов</span>
        <button
          className="vl-btn vl-btn--ghost vl-btn--sm"
          onClick={async () => {
            if (!confirm('Очистить всю историю?')) return;
            await clearHistory();
            await reload();
          }}
        >
          Очистить
        </button>
      </div>
      <div className="vl-list">
        {list.map((h) => (
          <div key={h.id} className="vl-list-item">
            <div className="vl-list-text">
              <div className="vl-list-title">{h.prompt}</div>
              <div className="vl-list-sub">
                {h.domain} · {h.tokensUsed} ток · ${h.costUsd.toFixed(3)} ·{' '}
                {new Date(h.ts).toLocaleString()}
              </div>
            </div>
            <button
              className="vl-btn vl-btn--ghost vl-btn--sm"
              onClick={() => onReuse(h.prompt)}
              title="Повторить запрос"
            >
              ↻
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
