import { defineConfig } from 'vite'

/**
 * Osobny build skryptu osadzającego. Trafia na cudze strony, więc musi być
 * jednym plikiem bez `import`-ów — stąd format `iife` i stała nazwa `embed.js`
 * zamiast nazwy z odciskiem: adres wklejony raz w kod strony gospodarza ma
 * przeżyć każde nasze wdrożenie.
 *
 * `emptyOutDir: false`, bo ten build dokłada plik do katalogu zbudowanego już
 * przez `vite build`, zamiast go zastępować.
 */
export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/embed.ts',
      formats: ['iife'],
      name: 'StrzelnicaOsadzenie',
      fileName: () => 'embed.js',
    },
  },
})
