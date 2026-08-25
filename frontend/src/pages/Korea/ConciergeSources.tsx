import { sx } from '@/styles/merge'
import type { StyleXStyles } from '@stylexjs/stylex'
import { linkStyles } from './korea.stylex'
import { conciergeSources } from './ConciergeSources.stylex'
import type { ConciergeSource } from "../../lib/conciergeGrounding"

export function ConciergeSources({
  sources,
  linkStyle = linkStyles.stone,
}: {
  sources: ConciergeSource[]
  linkStyle?: StyleXStyles
}) {
  if (sources.length === 0) return null
  const maps = sources.filter((s) => s.kind === "maps")
  const web = sources.filter((s) => s.kind === "web")
  return (
    <footer
      {...sx(conciergeSources.se33f2721)}
      aria-label="Sources"
      aria-live="polite"
    >
      {maps.length > 0 ? (
        <p>
          <span translate="no">Google Maps</span>
          {": "}
          {maps.map((source, i) => (
            <span key={source.uri}>
              {i > 0 ? " · " : null}
              <a href={source.uri} target="_blank" rel="noreferrer" {...sx(linkStyle)}>
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
              <a href={source.uri} target="_blank" rel="noreferrer" {...sx(linkStyle)}>
                {source.title}
              </a>
            </span>
          ))}
        </p>
      ) : null}
    </footer>
  )
}
