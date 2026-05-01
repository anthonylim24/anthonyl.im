import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { getRouteMetadata } from '@/lib/routeMetadata'

export function useFavicon() {
  const { pathname } = useLocation()

  useEffect(() => {
    const meta = getRouteMetadata(pathname)

    const link = document.querySelector<HTMLLinkElement>("link[rel='icon'][type='image/svg+xml']")
    if (link && link.getAttribute('href') !== meta.favicon) {
      link.setAttribute('href', meta.favicon)
    }

    const themeTag = document.querySelector<HTMLMetaElement>("meta[name='theme-color']")
    if (themeTag && themeTag.content !== meta.themeColor) {
      themeTag.content = meta.themeColor
    }
  }, [pathname])
}
