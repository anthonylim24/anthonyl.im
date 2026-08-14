import { memo, useMemo, type ReactNode } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { normalizeGeminiMarkdown } from "./conciergeMarkdown"

// Full GFM renderer for concierge replies. Gemini regularly sends headings,
// links, tables, fenced code, and HTML-ish markdown — not just bold/bullets.
// react-markdown is already a chatbot dependency; we skip rehype-highlight
// so Korea/Trips don't pull highlight.js. Output is React elements only.

const REMARK_PLUGINS = [remarkGfm]

const linkClass =
  "break-words underline decoration-rose-500/50 underline-offset-2 decoration-1 transition hover:decoration-rose-500 hover:text-rose-700 dark:hover:text-rose-300"

function heading(Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") {
  return function ConciergeHeading({ children }: { children?: ReactNode }) {
    return (
      <Tag className="text-[15px] font-semibold tracking-tight text-stone-900 first:mt-0 dark:text-stone-100">
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

function makeComponents(bulletClass: string, numberClass: string): Components {
  return {
    p: ({ children }) => <p>{children}</p>,
    strong: ({ children }) => (
      <strong className="font-semibold text-stone-900 dark:text-stone-100">{children}</strong>
    ),
    em: ({ children }) => <em className="italic">{children}</em>,
    del: ({ children }) => <del className="text-stone-500 dark:text-stone-400">{children}</del>,
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noreferrer" className={linkClass}>
        {children}
      </a>
    ),
    ul: ({ children }) => (
      <ul className="ml-1 space-y-1 [&_.concierge-marker-num]:hidden">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="ml-1 list-none space-y-1 [counter-reset:concierge] [&_.concierge-li]:[counter-increment:concierge] [&_.concierge-marker-dot]:hidden">
        {children}
      </ol>
    ),
    li: ({ children, className }) => {
      if (className?.includes("task-list-item")) {
        return <li className={`flex gap-2 [&>input]:mt-1.5 ${className}`}>{children}</li>
      }
      return (
        <li className="concierge-li flex gap-2">
          <span className={`concierge-marker-dot mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${bulletClass}`} aria-hidden />
          <span
            className={`concierge-marker-num mt-px shrink-0 font-semibold tabular-nums before:content-[counter(concierge)_'.'] ${numberClass}`}
            aria-hidden
          />
          <span>{children}</span>
        </li>
      )
    },
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-rose-300 pl-3 italic text-stone-600 dark:border-rose-800 dark:text-stone-400">
        {children}
      </blockquote>
    ),
    ...headings,
    code: ({ className, children }) => {
      if (className) {
        return <code className={`${className} text-[13px] font-mono`}>{children}</code>
      }
      return (
        <code className="rounded bg-stone-200/70 px-1 py-0.5 text-[13px] font-mono text-stone-800 dark:bg-stone-700/70 dark:text-stone-100">
          {children}
        </code>
      )
    },
    pre: ({ children }) => (
      <pre className="my-2 overflow-x-auto rounded-lg bg-stone-200/60 px-3 py-2 text-[13px] font-mono dark:bg-stone-900/80">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="my-2 overflow-x-auto">
        <table className="min-w-full text-[13px]">{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="border-b border-stone-200 text-left dark:border-stone-700">{children}</thead>
    ),
    th: ({ children }) => (
      <th className="px-2 py-1 font-semibold text-stone-800 dark:text-stone-200">{children}</th>
    ),
    td: ({ children }) => (
      <td className="px-2 py-1 text-stone-700 dark:text-stone-300">{children}</td>
    ),
    hr: () => <hr className="my-3 border-stone-200 dark:border-stone-700" />,
    img: ({ src, alt }) => (
      <img src={src} alt={alt ?? ""} loading="lazy" decoding="async" className="my-2 max-w-full rounded-lg" />
    ),
  }
}

const ConciergeMarkdown = memo(function ConciergeMarkdown({
  text,
  bulletClass,
  numberClass,
}: {
  text: string
  bulletClass: string
  numberClass: string
}) {
  const components = useMemo(
    () => makeComponents(bulletClass, numberClass),
    [bulletClass, numberClass],
  )
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
      {normalizeGeminiMarkdown(text)}
    </ReactMarkdown>
  )
})

export function ConciergeText({
  text,
  bulletClass = "bg-rose-400 dark:bg-rose-500",
  numberClass = "text-rose-500 dark:text-rose-400",
}: {
  text: string
  bulletClass?: string
  numberClass?: string
}) {
  return (
    <div className="concierge-text space-y-2 text-[15px] leading-relaxed [overflow-wrap:anywhere]">
      <ConciergeMarkdown text={text} bulletClass={bulletClass} numberClass={numberClass} />
    </div>
  )
}
