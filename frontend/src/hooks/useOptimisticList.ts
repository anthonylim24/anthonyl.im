import { useOptimistic } from "react"

/** Optimistic remove-by-id for list UIs (trip index, job lists). */
export function useOptimisticRemove<T extends { id: string }>(items: T[]) {
  return useOptimistic(items, (current, id: string) => current.filter((item) => item.id !== id))
}
