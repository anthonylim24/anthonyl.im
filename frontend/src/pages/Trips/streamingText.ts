import { useEffect, useRef, useState } from "react"

// Two things make streamed markdown look broken: half-finished syntax
// ("**Bloc" shows literal asterisks until the closing pair arrives) and text
// that lands in bursts. `settleStreamingMarkdown` hides the first;
// `useSmoothText` evens out the second.

/** Make a partial markdown string safe to render mid-stream. */
export function settleStreamingMarkdown(text: string): string {
  let out = text
  // A link whose URL is still arriving: show only its label.
  out = out.replace(/\[([^\]\n]*)\]\([^)\n]*$/, "$1")
  // An opening bracket with no close yet.
  out = out.replace(/\[([^\]\n]*)$/, "$1")
  // A list marker or heading with nothing after it yet.
  out = out.replace(/\n[ \t]*(?:[-*+]|\d+[.)]|#{1,6})[ \t]*$/, "")
  // Dangling emphasis markers at the very end ("**", "*", "_").
  out = out.replace(/(?:\*{1,3}|_{1,2})$/, "")
  // Close a bold run that has opened but not closed on the last line.
  const lastLine = out.slice(out.lastIndexOf("\n") + 1)
  const bold = lastLine.match(/\*\*/g)?.length ?? 0
  if (bold % 2 === 1) out += "**"
  else {
    const single = lastLine.replace(/\*\*/g, "").match(/(?<![\s*])\*|\*(?![\s*])/g)?.length ?? 0
    if (single % 2 === 1 && !/^\s*\*\s/.test(lastLine)) out += "*"
  }
  // An unterminated inline code span.
  if ((lastLine.match(/`/g)?.length ?? 0) % 2 === 1) out += "`"
  return out
}

/**
 * Reveal `text` at an even pace while `active`, catching up faster the
 * further behind it is. When not active (reply finished, reduced motion) the
 * full text shows at once.
 */
export function useSmoothText(text: string, active: boolean): string {
  const [shown, setShown] = useState(active ? 0 : text.length)
  const shownRef = useRef(shown)
  const targetRef = useRef(text.length)
  targetRef.current = text.length

  useEffect(() => {
    if (!active) {
      shownRef.current = targetRef.current
      setShown(targetRef.current)
      return
    }
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const backlog = targetRef.current - shownRef.current
      if (backlog > 0) {
        const elapsed = Math.min(64, now - last)
        // About 90 characters a second, faster when far behind.
        const step = Math.max(1, Math.round((elapsed / 1000) * Math.max(90, backlog * 4)))
        shownRef.current = Math.min(targetRef.current, shownRef.current + step)
        setShown(shownRef.current)
      } else if (backlog < 0) {
        shownRef.current = targetRef.current
        setShown(shownRef.current)
      }
      last = now
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active])

  if (!active) return text
  // Never cut inside a surrogate pair.
  let end = Math.min(shown, text.length)
  const code = text.charCodeAt(end - 1)
  if (end < text.length && code >= 0xd800 && code <= 0xdbff) end += 1
  return text.slice(0, end)
}
