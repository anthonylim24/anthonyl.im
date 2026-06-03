import { Fragment, type ReactNode } from "react"

// Minimal, dependency-free renderer for the concierge's Markdown-ish replies.
// We deliberately avoid react-markdown here: it would pull a heavy parser +
// its portfolio-themed component map into the Korea bundle. Concierge replies
// only ever use bold, bullet/numbered lists, and paragraphs — so a tiny,
// theme-matched parser keeps things light and flicker-free. All output is
// React elements (no dangerouslySetInnerHTML), so it's injection-safe.

function renderInline(text: string, keyBase: string): ReactNode[] {
  // Split on **bold** while keeping the delimiters.
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return (
        <strong key={`${keyBase}-b-${i}`} className="font-semibold text-stone-900 dark:text-stone-100">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <Fragment key={`${keyBase}-t-${i}`}>{part}</Fragment>
  })
}

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  let current: Block | null = null

  const flush = () => {
    if (current) blocks.push(current)
    current = null
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/)

    if (bullet) {
      if (current?.kind !== "ul") {
        flush()
        current = { kind: "ul", items: [] }
      }
      current.items.push(bullet[1])
    } else if (numbered) {
      if (current?.kind !== "ol") {
        flush()
        current = { kind: "ol", items: [] }
      }
      current.items.push(numbered[1])
    } else if (line.trim() === "") {
      flush()
    } else {
      if (current?.kind !== "p") {
        flush()
        current = { kind: "p", lines: [] }
      }
      current.lines.push(line)
    }
  }
  flush()
  return blocks
}

export function ConciergeText({ text }: { text: string }) {
  const blocks = parseBlocks(text)
  return (
    <div className="space-y-2 text-[15px] leading-relaxed">
      {blocks.map((block, bi) => {
        if (block.kind === "ul") {
          return (
            <ul key={bi} className="ml-1 space-y-1">
              {block.items.map((item, ii) => (
                <li key={ii} className="flex gap-2">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400 dark:bg-rose-500" aria-hidden />
                  <span>{renderInline(item, `${bi}-${ii}`)}</span>
                </li>
              ))}
            </ul>
          )
        }
        if (block.kind === "ol") {
          return (
            <ol key={bi} className="ml-1 space-y-1">
              {block.items.map((item, ii) => (
                <li key={ii} className="flex gap-2">
                  <span className="mt-px shrink-0 font-semibold text-rose-500 dark:text-rose-400 tabular-nums">
                    {ii + 1}.
                  </span>
                  <span>{renderInline(item, `${bi}-${ii}`)}</span>
                </li>
              ))}
            </ol>
          )
        }
        return (
          <p key={bi}>
            {block.lines.map((ln, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {renderInline(ln, `${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
