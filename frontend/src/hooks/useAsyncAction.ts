import { useCallback, useTransition } from "react"

/**
 * React 19 `useTransition` wrapper for async work. `isPending` stays true
 * until the async callback settles, replacing manual `isLoading` flags.
 */
export function useAsyncAction() {
  const [isPending, startTransition] = useTransition()

  const run = useCallback((task: () => Promise<unknown>) => {
    startTransition(async () => {
      await task()
    })
  }, [startTransition])

  return { isPending, startTransition, run } as const
}
