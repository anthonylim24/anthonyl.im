import type { ConciergeSource } from "../../lib/conciergeGrounding"

const DEFAULT_LINK =
  "break-words underline decoration-stone-400/70 underline-offset-2 decoration-1 transition hover:decoration-current hover:text-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 dark:hover:text-stone-100"

export function ConciergeSources({
  sources,
  linkClass = DEFAULT_LINK,
}: {
  sources: ConciergeSource[]
  linkClass?: string
}) {
  if (sources.length === 0) return null
  const maps = sources.filter((s) => s.kind === "maps")
  const web = sources.filter((s) => s.kind === "web")
  return (
    <footer className="mt-2.5 space-y-1.5 border-t border-stone-200/80 pt-2 text-[11px] leading-relaxed text-stone-600 dark:border-stone-700/80 dark:text-stone-400">
      {maps.length > 0 ? (
        <p>
          <span translate="no">Google Maps</span>
          {": "}
          {maps.map((source, i) => (
            <span key={source.uri}>
              {i > 0 ? " · " : null}
              <a href={source.uri} target="_blank" rel="noreferrer" className={linkClass}>
                {source.title}
              </a>
            </span>
          ))}
        </p>
      ) : null}
      {web.length > 0 ? (
        <p>
          Web
          {": "}
          {web.map((source, i) => (
            <span key={source.uri}>
              {i > 0 ? " · " : null}
              <a href={source.uri} target="_blank" rel="noreferrer" className={linkClass}>
                {source.title}
              </a>
            </span>
          ))}
        </p>
      ) : null}
    </footer>
  )
}
