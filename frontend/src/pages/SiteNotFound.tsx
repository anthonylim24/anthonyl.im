import { Link } from "react-router-dom"

/** Unknown top-level routes. Keep the parchment chatbot register. */
export function SiteNotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-start justify-center bg-[#F5F2ED] px-6 py-16 text-[#1C1917] dark:bg-[#171613] dark:text-[#E7E3DE]">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#78716C] dark:text-[#A8A29E]">
        404
      </p>
      <h1 className="mt-3 font-mono text-xl font-medium tracking-tight sm:text-2xl">
        This page is not here.
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#78716C] dark:text-[#A8A29E]">
        The address does not match a page on anthonyl.im.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-md bg-[#B8860B] px-4 text-sm font-medium text-[#FFFEFA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B8860B]"
        >
          Ask Anthony
        </Link>
        <Link
          to="/breathwork"
          className="inline-flex min-h-11 items-center rounded-md border border-[rgba(28,25,23,0.12)] px-4 text-sm text-[#1C1917] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B8860B] dark:border-[rgba(255,252,245,0.12)] dark:text-[#E7E3DE]"
        >
          BreathFlow
        </Link>
      </div>
    </div>
  )
}
