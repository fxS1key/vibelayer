# How to use VibeLayer

A practical, end-to-end guide. If anything here is wrong or unclear, open an issue — that's what makes documentation good.

---

## Table of contents

1. [Install the extension](#1-install-the-extension)
2. [Pick how you'll pay for generation](#2-pick-how-youll-pay-for-generation)
3. [Write your first prompt](#3-write-your-first-prompt)
4. [Manage saved patches](#4-manage-saved-patches)
5. [Export / import patches (free tier)](#5-export--import-patches-free-tier)
6. [Cloud sync (paid tier)](#6-cloud-sync-paid-tier)
7. [Self-host the server](#7-self-host-the-server)
8. [Embed VibeLayer in your own app (SDK)](#8-embed-vibelayer-in-your-own-app-sdk)
9. [Troubleshooting](#9-troubleshooting)
10. [Privacy & safety](#10-privacy--safety)

---

## 1. Install the extension

### Option A — From source (recommended while in beta)

```bash
git clone https://github.com/vibelayer/vibelayer
cd vibelayer
npm install
npm run build --workspace=@vibelayer/extension
```

Then in Chrome / Edge / Brave:

1. Open `chrome://extensions`
2. Toggle **Developer mode** on (top right)
3. Click **Load unpacked**
4. Select `vibelayer/extension/dist`

You should see the VibeLayer icon in the toolbar.

### Option B — Chrome Web Store

Coming soon. The store-published build is the same code as `extension/dist`, just signed and auto-updated.

---

## 2. Pick how you'll pay for generation

Each prompt sends DOM context + your instruction to an LLM. Someone has to pay the model. You have three options:

| Option | Cost to you | Setup | When to use |
| --- | --- | --- | --- |
| **VibeLayer cloud** | Pay-as-you-go tokens or subscription | Sign in, optionally top up | Easiest. Includes cloud sync if you upgrade. |
| **BYOK (Bring Your Own Key)** | Whatever Anthropic / OpenAI charge you | Paste your API key in settings | Free if you already have an Anthropic/OpenAI account. No VibeLayer billing. |
| **Self-hosted** | Cost of your own LLM key + your hosting | See [§7](#7-self-host-the-server) | Privacy, compliance, or running locally. |

### Setting up BYOK

1. Get an API key:
   - Anthropic: https://console.anthropic.com → API Keys → Create
   - OpenAI: https://platform.openai.com/api-keys
2. Open the VibeLayer side panel → **Settings** → **Bring your own key**
3. Pick the provider, paste the key (starts with `sk-...`), save.

The key is stored in `chrome.storage.local` on this device only. It's never synced, never sent to VibeLayer cloud — every generation goes from your browser straight to the provider.

---

## 3. Write your first prompt

Open any website and click the VibeLayer icon. The side panel opens with a text box.

**Tips for prompts that work first try:**

- **Be specific about what.** *"Make the sidebar narrower"* is better than *"clean up the layout"*.
- **Be specific about where.** *"On the Gmail inbox, hide the Promotions tab"* beats *"hide promotions"* without context.
- **Pick one change at a time.** A prompt that asks for five things is more likely to fail than five prompts that each ask for one.
- **Mention colors / sizes concretely.** *"Make headings 20% bigger and bold"* > *"make headings pop"*.

**Examples that work well:**

```
Recolor the unread email count badges to purple (#8b5cf6) on Gmail.

Hide the "Promotions" and "Updates" tabs above the inbox.

Apply dark mode to this entire site, but keep images in their original colors.

Make the sidebar 160px wide instead of 256px.

On every tweet that contains the word "crypto", hide the tweet.

Replace the bell notification icon with a moon emoji.
```

After you click **Generate**:

1. The panel shows an estimated token cost (~$0.02–$0.08 typical).
2. The LLM returns a patch (CSS, optionally a tiny bit of sandboxed JS).
3. You see a preview with **Apply & save** / **Reject**.
4. **Apply & save** — patch is injected into the page and stored locally for that domain. It auto-applies on every future visit.
5. **Reject** — nothing changes, no patch saved. You can edit the prompt and try again.

---

## 4. Manage saved patches

Open the panel → **My Patches**. Each entry shows: domain, name, on/off toggle, edit, delete.

- **Toggle off** — keeps the patch but stops applying it. Useful when a site update breaks a patch and you want to fall back to the default.
- **Edit** — re-prompt with the same patch as a starting point.
- **Delete** — removes the patch. On the paid tier, deletes go into a 30-day recycle bin.

Patches are scoped per domain (hostname). A patch saved on `mail.google.com` will not run on `docs.google.com`.

---

## 5. Export / import patches (free tier)

Free users own their patches forever via local + JSON.

**Export everything:**
Settings → My Patches → **Export all** → downloads `vibelayer-patches-YYYY-MM-DD.json`.

**Export a single patch:**
Right-click the patch in the list → **Export as JSON**.

**Import:**
Settings → **Import patches** → pick the JSON file → patches added to your local library. Conflicts (same id) prompt for overwrite or skip.

The JSON format is documented and stable across versions — you can edit the file by hand if you want.

---

## 6. Cloud sync (paid tier)

Cloud sync is the headline paid feature. The free tier is genuinely useful — sync just removes friction.

**What you get when you upgrade to Starter ($4/mo) or higher:**

- Patches sync across all signed-in devices in real time.
- 30-day recycle bin for accidental deletes.
- 90-day version history (Pro tier) — restore any prior version of a patch.
- Share a single patch via private link.
- Auto-backup on every patch update.

**How sync works:**

1. The extension marks any patch you create or edit as `dirty=true` in IndexedDB.
2. Every 15 seconds (or when you close the panel), it pushes dirty patches to the API.
3. The API maintains a vector clock per device per patch and rebroadcasts updates over Server-Sent Events to your other devices.
4. Conflicts (you edited the same patch on two offline devices) show a merge UI — keep local, keep server, or view diff and decide.

**Upgrade flow:**

Panel → **Settings** → **Upgrade** → pick a plan → Stripe checkout → done.

---

## 7. Self-host the server

Run the whole backend on your own machine. Useful for privacy, compliance, or just exploring the code.

```bash
git clone https://github.com/vibelayer/vibelayer
cd vibelayer
cp .env.example .env
```

Edit `.env`:

- `ANTHROPIC_API_KEY=` (or `OPENAI_API_KEY=`) — at least one is required
- `JWT_SECRET=` — generate with `openssl rand -base64 32`
- `DATABASE_URL=` and `REDIS_URL=` — the defaults match `docker-compose.yml`

Bring it up:

```bash
docker compose up
```

This starts:

- **Postgres 16** on `:5432` (schema auto-loaded from `server/src/db/schema.sql`)
- **Redis 7** on `:6379` (sync vector-clock cache + SSE broadcast)
- **VibeLayer API** on `:8080`

Point the extension at your local server: open the side panel, **Settings** → **API endpoint** → `http://localhost:8080`.

Verify it's alive:

```bash
curl http://localhost:8080/health
# {"ok":true}
```

**Production deployment.** The `Dockerfile` is multi-stage and works on Railway, Render, Fly.io, ECS, or anything that runs containers. The `deploy-server.yml` workflow ships to Railway out of the box — set the `RAILWAY_TOKEN` secret in your repo and merge to `main`.

---

## 8. Embed VibeLayer in your own app (SDK)

If you build a SaaS and want users to personalize *your* UI without you writing custom theming code, install the SDK.

```bash
npm install @vibelayer/sdk
```

```tsx
import { VibeLayerButton } from '@vibelayer/sdk/react';

export function Settings() {
  return (
    <VibeLayerButton
      apiKey={process.env.NEXT_PUBLIC_VIBELAYER_KEY!}
      regions={['#sidebar', '#dashboard-main']}
      branding={{ name: 'Customize', primaryColor: '#0ea5e9' }}
      onPatchApplied={(p) => analytics.track('vl_patch_applied', { description: p.description })}
    />
  );
}
```

**The `regions` prop is the security boundary.** Any CSS the LLM generates is auto-wrapped in `:is(<regions>) :is(<selector>) { ... }`, which means patches physically cannot reach DOM outside the selectors you opted in to. Users can't accidentally (or intentionally) break your login form by personalizing the sidebar.

Vanilla (no React):

```ts
import { VibeLayerClient } from '@vibelayer/sdk';

const client = new VibeLayerClient({
  apiKey: '...',
  regions: ['main'],
});

const patch = await client.generate('make headings bigger');
client.apply('my-patch-id', patch);
// later:
client.remove('my-patch-id');
```

Webhooks for `patch_applied` / `patch_removed` events are configurable in your VibeLayer dashboard (Developer tier+).

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Panel opens but **Generate** does nothing | No API key configured | Add a VibeLayer login or BYOK key in Settings |
| `API error 401` | Auth token expired | Sign out and sign back in |
| `API error 422 unsafe_patch` | Generated patch failed safety check | Re-prompt with more specific selectors |
| `model_output_malformed` | LLM produced non-JSON | Retry; if persistent, try a different model |
| Patch doesn't apply on reload | Site uses heavy SPA navigation | Patches re-apply on `document_idle`; SPA route changes may need manual toggle off/on |
| Patch worked yesterday, broken today | Site shipped a redesign and your selectors are stale | Re-prompt; selectors generated against attribute / `:has()` are more durable |
| Extension grayed out on `chrome://` URLs | Chrome blocks extensions on internal pages | Expected — use VibeLayer on http(s) sites only |
| BYOK key rejected | Key doesn't start with `sk-` or wrong provider | Double-check provider matches the key origin |

If you hit something not in this table, open an issue with the prompt, the site, and (if safe to share) the generated patch JSON.

---

## 10. Privacy & safety

**What gets sent to the API on a generation:**

- Your prompt text.
- A sanitized DOM snapshot of the active page. Before transmission, the extension strips: input/textarea/select values, password fields, hidden form fields, `data-*` attributes that look like emails or numeric IDs, scripts, and runs a regex pass over the HTML to redact emails / card numbers / phone numbers.
- The active page URL and title.
- Your auth token (or BYOK key, which is forwarded straight to the provider — VibeLayer never logs it).

**What does *not* get sent:**

- The contents of any input field.
- Cookies, session tokens, `Authorization` headers (browsers don't expose these to extensions in the first place).
- LocalStorage / IndexedDB contents from the page.

**What patches can do at runtime:**

- CSS: anything you can do with a stylesheet.
- JS: runs in a Web Worker with a hard ban on `fetch`, `XMLHttpRequest`, `WebSocket`, `eval`, `Function()`, and DOM access. The worker can only request mutations from a tiny vocabulary (hide / set text / set attribute) handled by the extension. So even if a malicious community preset somehow slipped past moderation, it cannot exfiltrate data or call home.

**Data retention** (cloud users):

- DOM snapshots: not stored — processed in memory and discarded.
- Prompts: 30 days, anonymized after 90.
- Patches: as long as your account exists.
- Usage logs: 12 months for billing reconciliation.

If any of this is a dealbreaker for you, [self-host](#7-self-host-the-server) — the same code runs on your own machine.
