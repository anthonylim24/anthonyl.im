import { afterEach, describe, expect, it } from 'vitest'
import { THEME_COLOR_DARK, THEME_COLOR_LIGHT, syncThemeColor } from '../themeColor'

const initialHead = document.head.innerHTML

afterEach(() => {
  document.head.innerHTML = initialHead
  document.documentElement.classList.remove('dark')
})

describe('syncThemeColor', () => {
  it('writes light and dark canvas colors onto the theme-color meta', () => {
    document.head.innerHTML = `
      <meta name="theme-color" media="(prefers-color-scheme: light)" content="${THEME_COLOR_LIGHT}" />
      <meta name="theme-color" media="(prefers-color-scheme: dark)" content="${THEME_COLOR_DARK}" />
    `

    syncThemeColor('dark')

    const tags = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    expect(tags).toHaveLength(1)
    expect(tags[0].content).toBe(THEME_COLOR_DARK)
    expect(tags[0].getAttribute('media')).toBeNull()

    syncThemeColor('light')
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe(
      THEME_COLOR_LIGHT,
    )
  })

  it('creates a theme-color meta when the document has none', () => {
    document.head.innerHTML = ''
    syncThemeColor('light')
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe(
      THEME_COLOR_LIGHT,
    )
  })
})
