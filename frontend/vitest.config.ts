import path from 'path'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// Playwright owns ./e2e — keep vitest out so it doesn't try to import
// @playwright/test and fail with a misleading resolution error.
const exclude = ['node_modules/**', 'dist/**', 'e2e/**', '.{git,cache,output,temp}/**']

// Tests that depend on platform objects (AbortSignal, DOMException, streams)
// being the same realm as the code under test. vmThreads runs each file in a
// `node:vm` context, where `instanceof` against those can differ from a
// browser. Add a file here rather than loosening its assertions.
const realmSensitive = ['src/lib/__tests__/apiService.test.ts']

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'happy-dom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: true,
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            // One happy-dom per worker instead of one per file: about half
            // the wall time of the default pool, still isolated per file.
            pool: 'vmThreads',
            exclude: [...exclude, ...realmSensitive],
          },
        },
        {
          extends: true,
          test: {
            name: 'realm',
            pool: 'forks',
            include: realmSensitive,
            exclude,
          },
        },
      ],
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  }),
)
