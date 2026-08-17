import { Link } from "react-router-dom"

/** Unknown Korea dossier addresses: send the reader to /trips/korea-2026. */
export function KoreaNotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-rose-600 dark:text-rose-400">
        404
      </p>
      <h1
        className="mt-3 font-serif text-3xl font-medium leading-tight text-stone-900 dark:text-stone-100"
        style={{ fontFamily: "'Cormorant Garamond', serif" }}
      >
        This page is not in the dossier.
      </h1>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-stone-600 dark:text-stone-400">
        The address does not match a Korea trip page. The dossier lives at
        /trips/korea-2026.
      </p>
      <Link
        to="/trips/korea-2026"
        className="mt-6 inline-flex min-h-11 items-center rounded-full bg-stone-900 px-5 text-sm font-medium text-white transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
      >
        Back to overview
      </Link>
    </div>
  )
}
