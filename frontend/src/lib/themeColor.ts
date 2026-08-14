export const THEME_COLOR_LIGHT = '#F5F2ED'
export const THEME_COLOR_DARK = '#171613'

/** Chat canvases. The root app runs its own cool neutral field, so it paints
 *  the browser chrome with these rather than the site-wide parchment. */
export const CHAT_THEME_COLORS = { light: '#F3F3F4', dark: '#0C0C0D' } as const

export function isDocumentDark(): boolean {
  return (
    document.documentElement.classList.contains('dark') ||
    Boolean(document.querySelector('.chat-dark'))
  )
}

export interface ThemeColorOverrides {
  light: string
  dark: string
}

/** Paint the browser chrome to match the active canvas (light or dark). */
export function syncThemeColor(mode?: 'light' | 'dark', overrides?: ThemeColorOverrides): void {
  const dark = mode ? mode === 'dark' : isDocumentDark()
  const color = dark
    ? (overrides?.dark ?? THEME_COLOR_DARK)
    : (overrides?.light ?? THEME_COLOR_LIGHT)
  const tags = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]
  const [primary, ...extras] = tags
  for (const extra of extras) extra.remove()

  if (primary) {
    primary.removeAttribute('media')
    if (primary.content !== color) primary.content = color
    return
  }

  const meta = document.createElement('meta')
  meta.setAttribute('name', 'theme-color')
  meta.setAttribute('content', color)
  document.head.appendChild(meta)
}
