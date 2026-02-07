import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const ROUTE_META: Record<string, { favicon: string; themeColor: string }> = {
  breathwork: { favicon: '/favicon-breath.svg', themeColor: '#090c1a' },
  default: { favicon: '/favicon-chat.svg', themeColor: '#030014' },
}

export function useFavicon() {
  const { pathname } = useLocation()

  useEffect(() => {
    const meta = pathname.startsWith('/breathwork')
      ? ROUTE_META.breathwork
      : ROUTE_META.default

    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
    if (link && link.href !== meta.favicon) {
      link.href = meta.favicon
    }

    const themeTag = document.querySelector<HTMLMetaElement>("meta[name='theme-color']")
    if (themeTag && themeTag.content !== meta.themeColor) {
      themeTag.content = meta.themeColor
    }
  }, [pathname])
}
