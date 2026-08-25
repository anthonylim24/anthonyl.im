import path from 'path'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

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
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  }),
)
