// @testing-library/jest-dom 7 augments vitest's `Assertion<T>`, which vitest 5
// re-declared as `Assertion<R, T>`, so its typings no longer merge. vitest 5's
// extension point is `Matchers<R, T>`. Drop this file once jest-dom ships
// vitest 5 typings.
import 'vitest'
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

declare module 'vitest' {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown>
    extends TestingLibraryMatchers<unknown, R> {
    /** Keeps `T` used so the declaration merges with vitest's. */
    readonly __jestDomSubject?: T
  }
}
