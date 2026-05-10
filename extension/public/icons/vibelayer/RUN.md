# How to run VibeLayer locally

Quick reference. Detailed guide is in [USAGE.md](./USAGE.md).

## Prerequisites

- **Node.js ≥ 20** (`node -v` to check; install via https://nodejs.org or `brew install node`)
- **Docker** (only needed for the server + Postgres + Redis) — https://docker.com
- An **Anthropic** or **OpenAI** API key (or BYOK from the extension)

## 1. Install dependencies

From the repo root:

```bash
cd "/Users/luxxx/VS Python/PROJECT/vibelayer"
npm install
```

This installs everything for all workspaces (extension, server, sdk, packages/shared) in one shot.

## 2. Run the extension

```bash
npm run build --workspace=@vibelayer/extension
```

You'll get `extension/dist/`. To load it:

1. Open `chrome://extensions` in Chrome / Brave / Edge
2. Toggle **Developer mode** (top-right)
3. Click **Load unpacked**
4. Pick `extension/dist`

For live-reload during development:

```bash
npm run dev --workspace=@vibelayer/extension
```

Reload the extension in `chrome://extensions` after each rebuild. (The crxjs HMR works for the panel; background + content scripts need a manual reload.)

## 3. Run the server (optional — only needed if you don't use BYOK)

```bash
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY (or OPENAI_API_KEY) and JWT_SECRET
docker compose up
```

API will be live at `http://localhost:8080`. Verify:

```bash
curl http://localhost:8080/health
# {"ok":true}
```

Point the extension at it: open the side panel → Settings → API endpoint → `http://localhost:8080`.

## 4. Configure the extension

Click the VibeLayer icon → side panel opens. Then either:

- **BYOK** — Settings → Bring your own key → paste an `sk-...` key. No further setup. The extension calls Anthropic/OpenAI directly from your browser.
- **Self-hosted** — Settings → API endpoint → `http://localhost:8080`. Sign in (the local server has minimal auth wired; for production add a real OAuth provider).

## 5. Try it

Visit any website. Click the VibeLayer icon. Type something like:

```
Make all headings 20% larger and bold.
```

Click **Generate**, see the preview, click **Apply & save**. Reload the page — the patch auto-applies.

---

## Troubleshooting the build

### `ENOENT: Could not load manifest asset "icons/16.png"`

Icons must exist in `extension/public/icons/`. The repo ships placeholder PNGs there. If they're missing, regenerate:

```bash
cd extension
mkdir -p public/icons
python3 -c "
import struct, zlib
def png(w,h,c):
  s=b'\x89PNG\r\n\x1a\n'
  def ck(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
  ihdr=struct.pack('>IIBBBBB',w,h,8,6,0,0,0)
  raw=b''.join(b'\x00'+bytes(c)*w for _ in range(h))
  return s+ck(b'IHDR',ihdr)+ck(b'IDAT',zlib.compress(raw,9))+ck(b'IEND',b'')
for sz in (16,48,128):
  open(f'public/icons/{sz}.png','wb').write(png(sz,sz,(139,92,246,255)))
"
```

### `import ... assert { type: 'json' }` warning / error

Already fixed in `vite.config.ts` — we now read manifest.json with `fs.readFileSync` instead of import assertions.

### `Cannot find module '@vibelayer/shared'`

Make sure you ran `npm install` at the **repo root**, not inside `extension/`. Workspaces are wired from the top-level `package.json`.

### TypeScript errors about `.js` extensions on `.ts` imports

Expected — `moduleResolution: "Bundler"` in `tsconfig.base.json` handles this at typecheck time, and Vite handles it at build time. If your editor complains, restart the TS server.

### `npm error workspace @vibelayer/extension@0.1.0 ... command failed`

Run with verbose logging:

```bash
npm run build --workspace=@vibelayer/extension --verbose
```

Common causes: stale `node_modules` (delete and reinstall), wrong working directory, missing icons.

### Build succeeds but extension won't load

- Check that `extension/dist/manifest.json` was generated.
- In `chrome://extensions`, click **Errors** under the VibeLayer card to see the real reason.
- Most common: side panel API not available on Chrome < 114 — update Chrome.

---

## Tests / typecheck

```bash
npm run typecheck    # all workspaces
npm run lint
npm run test --if-present
```
