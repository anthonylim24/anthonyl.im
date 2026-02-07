import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const FAVICONS: Record<string, string> = {
  breathwork: '/favicon-breath.svg',
  default: '/favicon-chat.svg',
}

export function useFavicon() {
  const { pathname } = useLocation()

  useEffect(() => {
    const icon = pathname.startsWith('/breathwork')
      ? FAVICONS.breathwork
      : FAVICONS.default

    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
    if (link && link.href !== icon) {
      link.href = icon
    }
  }, [pathname])
}
