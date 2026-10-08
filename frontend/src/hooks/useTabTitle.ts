import { useEffect } from 'react'

/** Sets the tab title while mounted (no-op until `title` is known), then restores it. */
export function useTabTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = title
    return () => {
      document.title = previous
    }
  }, [title])
}
