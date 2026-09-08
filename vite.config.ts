import { fileURLToPath } from 'url'

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // La app se despliega como sitio estático; los IDs de SharePoint viven
    // en variables de entorno o en el panel de ajustes, nunca en el bundle.
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        // `redirect.html` es el puente de MSAL para el login emergente
        // (ver ese archivo y src/services/sharepointService.ts): tiene que
        // quedar publicado junto al `index.html` normal.
        main: here('index.html'),
        redirect: here('redirect.html'),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
