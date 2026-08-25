import { sx } from '@/styles/merge'
import type { StyleXStyles } from '@stylexjs/stylex'
import { skeletons } from './skeletons.stylex'

interface SkeletonProps {
  style?: StyleXStyles
}

/** A pulsing neutral block. Pass sizing via `style`. */
export function Skeleton({ style }: SkeletonProps) {
  return (
    <div
      aria-hidden
      {...sx(skeletons.pulse, 'animate-pulse', style)}
    />
  )
}

/** Mirrors the shape of a JobCard while waiting for the first jobs fetch. */
export function JobCardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading job…"
      {...sx(skeletons.s28353d49)}
    >
      <div {...sx(skeletons.s71b5dc26)}>
        <Skeleton style={skeletons.s7a633fb2} />
        <Skeleton style={skeletons.s41332264} />
      </div>
      <div {...sx(skeletons.sbe497a6c)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} style={skeletons.sdc87e5e6} />
        ))}
      </div>
      <div {...sx(skeletons.s9346b488)}>
        <Skeleton style={skeletons.sd8f38447} />
        <Skeleton style={skeletons.sd8f3842a} />
        <Skeleton style={skeletons.sd8f38426} />
      </div>
    </div>
  )
}

/** Mirrors the shape of a PlaceCard while waiting for the extracted-places fetch. */
export function PlaceCardSkeleton() {
  return (
    <article
      role="status"
      aria-label="Loading place…"
      {...sx(skeletons.s28353d49)}
    >
      <div {...sx(skeletons.s584ecc35)}>
        <div {...sx(skeletons.s5ffb8135)}>
          <Skeleton style={skeletons.saf497730} />
          <Skeleton style={skeletons.s457cfced} />
        </div>
        <Skeleton style={skeletons.s4fdbd2eb} />
      </div>
      <div {...sx(skeletons.s27bd8e85)}>
        <Skeleton style={skeletons.s6a3bc677} />
        <Skeleton style={skeletons.s457d0832} />
      </div>
      <div {...sx(skeletons.s9af859e6)}>
        <Skeleton style={skeletons.s72a7bce9} />
        <Skeleton style={skeletons.seb30966d} />
        <Skeleton style={skeletons.sfa1ee365} />
      </div>
    </article>
  )
}
