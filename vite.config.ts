import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import yaml from '@rollup/plugin-yaml'
import topLevelAwait from 'vite-plugin-top-level-await'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import wasm from 'vite-plugin-wasm'

// Vite config for relay-client-web.
// NOTE: Production builds use esbuild (npm run build), not Vite, due to better WASM handling.
// This config is primarily for dev mode (npm run dev:vite) and build:vite fallback.
export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
    react(),
    yaml(),
    viteStaticCopy({
      targets: [
        {
          // Copy everything from public/ except the legacy esbuild index.html to avoid overriding Vite's output.
          src: ['public/**', '!public/index.html', '!public/template', '!public/template/**'],
          dest: '.',
          globOptions: {
            ignore: ['public/template', 'public/template/**'],
          },
        },
      ],
    }),
  ],
  publicDir: 'public',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    copyPublicDir: false,
    rollupOptions: {
      external: [],
      output: {
        manualChunks: undefined,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['@clevertree/hook-transpiler', '@clevertree/themed-styler'],
    esbuildOptions: {
      target: 'es2022',
    },
  },
  worker: {
    format: 'es',
    plugins: () => [wasm(), topLevelAwait()],
  },
})
