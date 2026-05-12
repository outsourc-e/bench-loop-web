import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Public marketing site. Static deploy target (Vercel/Cloudflare/Fly static).
// No /api proxy: the site never talks to the local API. The hosted leaderboard
// will read /data/leaderboard.json (refreshed by a publish script).
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    sourcemap: false,
    outDir: 'dist',
    assetsDir: 'assets',
  },
})
