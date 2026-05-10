import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx, type ManifestV3Export } from '@crxjs/vite-plugin';

// Avoid `import ... assert { type: 'json' }` — unstable across Node versions.
const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  readFileSync(resolve(__dirname, 'manifest.json'), 'utf8'),
) as ManifestV3Export;

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: { outDir: 'dist', sourcemap: true, emptyOutDir: true },
  server: { port: 5173, strictPort: true, hmr: { port: 5174 } },
});
