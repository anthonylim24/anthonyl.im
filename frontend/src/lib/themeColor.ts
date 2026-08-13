export const THEME_COLOR_LIGHT = '#F5F2ED'
export const THEME_COLOR_DARK = '#171613'

export function isDocumentDark(): boolean {
  return (
    document.documentElement.classList.contains('dark') ||
    Boolean(document.querySelector('.chatbot-dark'))
  )
}

/** Paint the browser chrome to match the active canvas (light or dark). */
export function syncThemeColor(mode?: 'light' | 'dark'): void {
  const dark = mode ? mode === 'dark' : isDocumentDark()
  const color = dark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT
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
