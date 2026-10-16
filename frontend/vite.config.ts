import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Backend routes live at the site root (no /api prefix), so they're proxied to the
// Docker stack (Caddy on :80) during development. Only paths with a trailing slash go
// to Django, so the React page at /minesweeper isn't swallowed by /minesweeper/<id>/.
const BACKEND_PATHS = ['sessions', 'minesweeper', 'leaderboard', 'games', 'admin', 'static']

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.BACKEND_URL ?? 'http://localhost'
  return {
    plugins: [react()],
    server: {
      proxy: { [`^/(${BACKEND_PATHS.join('|')})/`]: { target, changeOrigin: true } },
    },
  }
})
