// @vibelayer/sdk — vanilla JS entry. Frameworks layer on top (see ./react).
//
// Two responsibilities:
//   1. Call the VibeLayer API to generate a patch given a prompt + scoped DOM.
//   2. Apply the returned patch only inside developer-allowed `regions`.

export interface SdkConfig {
  apiBase?: string;
  apiKey: string; // developer's VibeLayer key — billed to their account
  regions: string[]; // CSS selectors that bound where patches may apply
  onPatchApplied?: (patch: GeneratedPatch) => void;
  onPatchRemoved?: (patchId: string) => void;
  branding?: { name?: string; primaryColor?: string };
}

export interface GeneratedPatch {
  css: string;
  js: string;
  description: string;
  affectedSelectors: string[];
}

export class VibeLayerClient {
  private readonly cfg: Required<Omit<SdkConfig, 'onPatchApplied' | 'onPatchRemoved' | 'branding'>> &
    Pick<SdkConfig, 'onPatchApplied' | 'onPatchRemoved' | 'branding'>;
  private readonly applied = new Map<string, HTMLStyleElement>();

  constructor(cfg: SdkConfig) {
    this.cfg = {
      apiBase: cfg.apiBase ?? 'https://api.vibelayer.io',
      ...cfg,
    };
  }

  async generate(prompt: string): Promise<GeneratedPatch> {
    // Snapshot only the regions the developer allowed. This is the SDK's main
    // safety guarantee — users can't break parts of the app the dev didn't opt in.
    const html = this.cfg.regions
      .flatMap((sel) => Array.from(document.querySelectorAll(sel)))
      .map((el) => el.outerHTML)
      .join('\n')
      .slice(0, 80_000);

    const res = await fetch(`${this.cfg.apiBase}/api/v1/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        snapshot: {
          url: location.href,
          domain: location.hostname,
          title: document.title,
          html,
          viewport: { width: innerWidth, height: innerHeight },
          capturedAt: new Date().toISOString(),
        },
      }),
    });
    if (!res.ok) throw new Error(`VibeLayer API ${res.status}`);
    const data = (await res.json()) as { patch: GeneratedPatch };
    return data.patch;
  }

  apply(patchId: string, patch: GeneratedPatch): void {
    // Wrap the patch CSS in :is(<regions>) { ... } so it physically cannot
    // affect anything outside the allowed regions. Crude but effective.
    const regionScope = this.cfg.regions.join(', ');
    const scopedCss = patch.css
      .split('}')
      .filter(Boolean)
      .map((rule) => {
        const [sel, body] = rule.split('{');
        if (!sel || !body) return '';
        return `:is(${regionScope}) :is(${sel.trim()}){${body}}`;
      })
      .join('\n');

    const style = document.createElement('style');
    style.setAttribute('data-vibelayer-sdk', patchId);
    style.textContent = scopedCss;
    document.head.appendChild(style);
    this.applied.set(patchId, style);
    this.cfg.onPatchApplied?.(patch);
    // Note: SDK build does not run patch JS by default — too risky in arbitrary
    // host apps. Developers can opt in by handling the patch in onPatchApplied.
  }

  remove(patchId: string): void {
    const el = this.applied.get(patchId);
    if (el) {
      el.remove();
      this.applied.delete(patchId);
      this.cfg.onPatchRemoved?.(patchId);
    }
  }
}
