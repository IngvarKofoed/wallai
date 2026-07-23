import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: 'src/web',
  // .env lives at the repo root (this config's directory), not in `root` (src/web), so
  // point Vite's env loading here — that's where VITE_* vars (e.g. VITE_WS_PORT) are read.
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  server: {
    // Frontend dev server. 8989 avoids the crowded Vite 5173 default; the backend
    // WebSocket server is separate (WALLAI_PORT, default 8787).
    port: 8989,
  },
})
