import { useLocation } from "react-router-dom"
import { PromptBar } from "./composer"
import { useWorkspace } from "./workspace"

export function usePromptRoute(): boolean {
  const { pathname } = useLocation()
  if (pathname === "/trips" || pathname === "/trips/" || pathname.startsWith("/trips/new")) return false
  return /^\/trips\/.+/.test(pathname)
}

export function WorkspacePrompt() {
  const { pathname } = useLocation()
  const { promptHandler, promptPlaceholder, currentTrip } = useWorkspace()
  const visible = usePromptRoute()
  if (!visible || !promptHandler) return null

  const mentions = (currentTrip?.days ?? []).map((d, i) => ({
    id: d.id,
    label: d.title?.trim() || `Day ${i + 1}`,
    kind: "day" as const,
  }))

  return (
    <div className="pointer-events-none sticky bottom-0 z-20 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-2 sm:px-6">
      <div className="pointer-events-auto mx-auto max-w-3xl">
        <PromptBar
          placeholder={
            pathname.endsWith("/edit")
              ? promptPlaceholder || "Enhance this trip, or /generate empty days"
              : pathname.endsWith("/new")
                ? promptPlaceholder || "Draft this trip, or /blank to start empty"
                : promptPlaceholder
          }
          mentionOptions={mentions}
          onSubmit={promptHandler}
        />
      </div>
    </div>
  )
}
