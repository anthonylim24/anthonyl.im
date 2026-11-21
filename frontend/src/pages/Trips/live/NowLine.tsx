import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { live as s } from "./live.stylex"

/**
 * The "now" marker in today's stop list: a dot on the timeline's gutter and
 * a hairline in the trip's colour, labelled with the time ("HH:mm"). It is an
 * `li` because the stop list is an `ol`; pass `as="div"` anywhere else. Not a
 * live region: the minute changing is not news.
 */
export function NowLine({ time, as: Tag = "li" }: { time: string; as?: "li" | "div" }) {
  return (
    <Tag role="separator" aria-label={`Now, ${time}`} data-now="" {...sx(s.nowLine)}>
      <span {...sx(s.nowGutter)} aria-hidden>
        <span {...sx(s.nowGutterLine)} />
        <span {...sx(s.nowDot)} />
      </span>
      <span {...sx(s.nowTrack)} aria-hidden>
        <span {...sx(a.mono, s.nowLabel)}>Now · {time}</span>
        <span {...sx(s.nowRule)} />
      </span>
    </Tag>
  )
}
