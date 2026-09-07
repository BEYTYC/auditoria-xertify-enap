/**
 * vite.demo.config.ts
 * Construye la demo de un solo archivo que se publica como página web.
 * Todo queda embebido (CSS y JS) porque el visor bloquea recursos externos.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  build: {
    outDir: 'dist-demo',
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
