import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { getRouteMetadata } from '@/lib/routeMetadata'
import { withViteBase } from '@/lib/routerBasename'
import { syncThemeColor } from '@/lib/themeColor'

export function useFavicon() {
  const { pathname } = useLocation()

  useEffect(() => {
    const meta = getRouteMetadata(pathname)
    const href = withViteBase(meta.favicon)

    const link = document.querySelector<HTMLLinkElement>("link[rel='icon'][type='image/svg+xml']")
    if (link && link.getAttribute('href') !== href) {
      link.setAttribute('href', href)
    }

    syncThemeColor()
  }, [pathname])
}
