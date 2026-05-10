import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' assert { type: 'json' };

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: { outDir: 'dist', sourcemap: true, emptyOutDir: true },
  server: { port: 5173, strictPort: true, hmr: { port: 5174 } },
});
