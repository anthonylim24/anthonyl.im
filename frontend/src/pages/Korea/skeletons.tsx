// Skeleton placeholders for the Ingest + Places pages. Plain Tailwind
// `animate-pulse` blocks — no Motion involvement so they can't get stuck
// in an opacity-0 state under the React 19 / motion stall bug that bit
// us earlier (see KoreaLayout.tsx, PR #360).

interface SkeletonProps {
  className?: string
}

/** A pulsing neutral block. Inherits sizing from `className`. */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={
        'animate-pulse rounded-md bg-stone-200/70 dark:bg-stone-800/60 ' + className
      }
    />
  )
}

/** Mirrors the shape of a JobCard while waiting for the first jobs fetch. */
export function JobCardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading job…"
      className="relative rounded-2xl border border-stone-200/80 bg-white p-5 dark:border-stone-800/80 dark:bg-stone-900/60"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      {/* Step timeline placeholder — 5 pills */}
      <div className="mt-4 flex gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-16 rounded-full" />
        ))}
      </div>
      <div className="mt-3 flex gap-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  )
}

/** Mirrors the shape of a PlaceCard while waiting for the extracted-places
 *  fetch on /korea/places. */
export function PlaceCardSkeleton() {
  return (
    <article
      role="status"
      aria-label="Loading place…"
      className="relative rounded-2xl border border-stone-200/80 bg-white p-5 dark:border-stone-800/80 dark:bg-stone-900/60"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-28 rounded-full" />
      </div>
    </article>
  )
}
