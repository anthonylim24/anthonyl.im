import { coverDockClass, wrapAnywhereClass } from "../ui"

/** Condensed title that fades in under chrome. Adds no document height. */
export function CoverDock({
  title,
  measure = "wide",
}: {
  title: string
  measure?: "wide" | "form"
}) {
  return (
    <div className={coverDockClass} aria-hidden>
      <div
        className={`mx-auto flex h-full w-full items-center ${
          measure === "form" ? "max-w-2xl" : "max-w-5xl"
        }`}
      >
        <p className={`cover-dock-title truncate ${wrapAnywhereClass}`}>{title}</p>
      </div>
    </div>
  )
}
