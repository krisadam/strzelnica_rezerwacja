import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { naglowekOsadzenia } from './naglowek-osadzenia.js'

export default defineConfig({
  plugins: [react(), naglowekOsadzenia()],
  // `pnpm db:env` zapisuje `.env` w korzeniu monorepozytorium, a Vite szuka go
  // domyślnie w katalogu aplikacji. Bez tego obie aplikacje startują bez
  // konfiguracji Supabase.
  envDir: '../..',
  server: {
    port: 5173,
    strictPort: true,
  },
})
