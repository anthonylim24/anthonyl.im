import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import stylex from '@stylexjs/unplugin'
import path from 'path'

export default defineConfig({
  plugins: [
    stylex.vite({
      useCSSLayers: {
        before: ['reset', 'base'],
        after: ['utilities'],
        prefix: 'stylex',
      },
    }),
    react(),
  ],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    // Playwright owns ./e2e — keep vitest out so it doesn't try to import
    // @playwright/test and fail with a misleading resolution error.
    exclude: ['node_modules/**', 'dist/**', 'e2e/**', '.{git,cache,output,temp}/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
