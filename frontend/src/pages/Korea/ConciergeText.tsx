import { sx } from '@/styles/merge'
import type { StyleXStyles } from '@stylexjs/stylex'
import { conciergeText } from './ConciergeText.stylex'
import { memo, useMemo, type ReactNode } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { normalizeGeminiMarkdown } from "./conciergeMarkdown"

const REMARK_PLUGINS = [remarkGfm]

function heading(Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") {
  return function ConciergeHeading({ children }: { children?: ReactNode }) {
    return (
      <Tag {...sx(conciergeText.sdb299471)}>
        {children}
      </Tag>
    )
  }
}

const headings = {
  h1: heading("h1"),
  h2: heading("h2"),
  h3: heading("h3"),
  h4: heading("h4"),
  h5: heading("h5"),
  h6: heading("h6"),
}

function makeComponents(
  bulletStyle: StyleXStyles,
  numberStyle: StyleXStyles,
): Components {
  return {
    p: ({ children }) => <p>{children}</p>,
    strong: ({ children }) => (
      <strong {...sx(conciergeText.s49bc78d)}>{children}</strong>
    ),
    em: ({ children }) => <em {...sx(conciergeText.sb9bd3a30)}>{children}</em>,
    del: ({ children }) => <del {...sx(conciergeText.sa8c83dfd)}>{children}</del>,
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noreferrer" {...sx(conciergeText.link)}>
        {children}
      </a>
    ),
    ul: ({ children }) => (
      <ul {...sx(conciergeText.saa61e255)}>{children}</ul>
    ),
    ol: ({ children }) => (
      <ol {...sx(conciergeText.sfcb8c19d)}>
        {children}
      </ol>
    ),
    li: ({ children, className }) => {
      if (className?.includes("task-list-item")) {
        return (
          <li {...sx(conciergeText.taskListItem, 'task-list-item', className)}>
            {children}
          </li>
        )
      }
      return (
        <li {...sx(conciergeText.s9def5fd, 'concierge-li')}>
          <span {...sx(bulletStyle, 'concierge-marker-dot')} aria-hidden />
          <span {...sx(numberStyle, 'concierge-marker-num')} aria-hidden />
          <span>{children}</span>
        </li>
      )
    },
    blockquote: ({ children }) => (
      <blockquote {...sx(conciergeText.seec3caed)}>
        {children}
      </blockquote>
    ),
    ...headings,
    code: ({ className, children }) => {
      if (className) {
        return (
          <code {...sx(conciergeText.fencedCode, className)}>
            {children}
          </code>
        )
      }
      return (
        <code {...sx(conciergeText.sf84eb04d)}>
          {children}
        </code>
      )
    },
    pre: ({ children }) => (
      <pre {...sx(conciergeText.s2b72a23f)}>
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div {...sx(conciergeText.s1026c40)}>
        <table {...sx(conciergeText.sd38cd0f8)}>{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead {...sx(conciergeText.scab74e81)}>{children}</thead>
    ),
    th: ({ children }) => (
      <th {...sx(conciergeText.s132c7a2d)}>{children}</th>
    ),
    td: ({ children }) => (
      <td {...sx(conciergeText.s23406cde)}>{children}</td>
    ),
    hr: () => <hr {...sx(conciergeText.s5c8bd8c9)} />,
    img: ({ src, alt }) => (
      <img src={src} alt={alt ?? ""} loading="lazy" decoding="async" {...sx(conciergeText.s95cb8ebe)} />
    ),
  }
}

const ConciergeMarkdown = memo(function ConciergeMarkdown({
  text,
  bulletStyle,
  numberStyle,
}: {
  text: string
  bulletStyle: StyleXStyles
  numberStyle: StyleXStyles
}) {
  const components = useMemo(
    () => makeComponents(bulletStyle, numberStyle),
    [bulletStyle, numberStyle],
  )
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
      {normalizeGeminiMarkdown(text)}
    </ReactMarkdown>
  )
})

export function ConciergeText({
  text,
  bulletStyle = conciergeText.markerDotRose,
  numberStyle = conciergeText.markerNumRose,
}: {
  text: string
  bulletStyle?: StyleXStyles
  numberStyle?: StyleXStyles
}) {
  return (
    <div {...sx(conciergeText.sd79dc566, 'concierge-text')}>
      <ConciergeMarkdown text={text} bulletStyle={bulletStyle} numberStyle={numberStyle} />
    </div>
  )
}

/** Stream failures sit outside the transcript so token updates stay silent. */
export function ConciergeStreamStatus({ error }: { error?: string }) {
  if (!error) return null
  return (
    <p
      role="status"
      aria-live="polite"
      {...sx(conciergeText.sdc9eac6a)}
    >
      ⚠️ {error}
    </p>
  )
}
