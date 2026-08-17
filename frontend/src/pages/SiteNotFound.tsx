import { Link } from "react-router-dom"

/** Unknown top-level routes. Keep the parchment chatbot register. */
export function SiteNotFound() {
  return (
    <div className="chatbot-shadow flex min-h-dvh flex-col items-start justify-center bg-[var(--chat-bg)] px-6 py-16 text-[var(--chat-text)]">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--chat-mid)]">
        404
      </p>
      <h1 className="mt-3 font-mono text-xl font-medium tracking-tight sm:text-2xl">
        This page is not here.
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--chat-mid)]">
        The address does not match a page on anthonyl.im.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-md bg-[var(--chat-accent)] px-4 text-sm font-medium text-[var(--chat-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-accent)]"
        >
          Ask Anthony
        </Link>
        <Link
          to="/breathwork"
          className="inline-flex min-h-11 items-center rounded-md border border-[var(--chat-line)] px-4 text-sm text-[var(--chat-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-accent)]"
        >
          BreathFlow
        </Link>
      </div>
    </div>
  )
}
