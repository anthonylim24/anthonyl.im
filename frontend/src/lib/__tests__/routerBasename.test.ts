import { describe, expect, it } from 'vitest'
import { routerBasename, withViteBase } from '../routerBasename'

describe('routerBasename', () => {
  it('is undefined for the production root base', () => {
    expect(routerBasename('/')).toBeUndefined()
    expect(routerBasename('')).toBeUndefined()
  })

  it('strips the trailing slash Vite always adds', () => {
    expect(routerBasename('/preview/pr/12/')).toBe('/preview/pr/12')
    expect(routerBasename('/preview/pr/12')).toBe('/preview/pr/12')
  })

  it('prefixes root-absolute assets with the Vite base', () => {
    expect(withViteBase('/favicon-breath.svg', '/')).toBe('/favicon-breath.svg')
    expect(withViteBase('/favicon-breath.svg', '/preview/pr/12/')).toBe(
      '/preview/pr/12/favicon-breath.svg',
    )
  })
})
