<<<<<<< HEAD
=======
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import stylex from '@stylexjs/unplugin'
>>>>>>> origin/cursor/tailwind-to-stylex-chatbot-2aeb
import path from 'path'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

<<<<<<< HEAD
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'happy-dom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: true,
      // Playwright owns ./e2e — keep vitest out so it doesn't try to import
      // @playwright/test and fail with a misleading resolution error.
      exclude: ['node_modules/**', 'dist/**', 'e2e/**', '.{git,cache,output,temp}/**'],
=======
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
>>>>>>> origin/cursor/tailwind-to-stylex-chatbot-2aeb
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  }),
)
