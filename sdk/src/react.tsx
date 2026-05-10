// React binding. <VibeLayerButton /> renders a single "Personalize" button
// that opens an in-page prompt input, calls generate(), and applies the patch.

import { useCallback, useMemo, useState } from 'react';
import { VibeLayerClient, type SdkConfig } from './index.js';

export interface VibeLayerButtonProps extends SdkConfig {
  label?: string;
}

export function VibeLayerButton(props: VibeLayerButtonProps) {
  const client = useMemo(() => new VibeLayerClient(props), [props]);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onGenerate = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const patch = await client.generate(prompt);
      client.apply(crypto.randomUUID(), patch);
      setOpen(false);
      setPrompt('');
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }, [client, prompt]);

  const accent = props.branding?.primaryColor ?? '#8b5cf6';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          background: accent,
          color: 'white',
          border: 0,
          borderRadius: 6,
          padding: '8px 12px',
          cursor: 'pointer',
        }}
      >
        {props.label ?? `${props.branding?.name ?? 'Personalize'}`}
      </button>
      {open && (
        <div
          role="dialog"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div style={{ background: '#fff', padding: 16, borderRadius: 8, width: 420 }}>
            <h3 style={{ margin: 0 }}>Describe the change</h3>
            <textarea
              autoFocus
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              style={{ width: '100%', minHeight: 100, marginTop: 8 }}
            />
            {err && <div style={{ color: '#b91c1c', fontSize: 12 }}>{err}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button onClick={() => setOpen(false)}>Cancel</button>
              <button
                onClick={onGenerate}
                disabled={busy || prompt.length < 3}
                style={{ background: accent, color: 'white', border: 0, padding: '6px 10px' }}
              >
                {busy ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
