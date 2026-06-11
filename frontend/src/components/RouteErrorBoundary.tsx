import { Component, createRef, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** Which app this boundary protects — drives accent color + copy. */
  app: 'chatbot' | 'breathwork' | 'korea' | 'trips'
  children: ReactNode
}

interface State {
  error: Error | null
}

const appCopy: Record<Props['app'], { heading: string; accent: string }> = {
  chatbot: {
    heading: 'Something went wrong loading the chat.',
    accent: 'text-stone-900 dark:text-stone-100',
  },
  breathwork: {
    heading: 'Something went wrong loading BreathFlow.',
    accent: 'text-amber-800 dark:text-amber-300',
  },
  korea: {
    heading: 'Something went wrong loading the Korea itinerary.',
    accent: 'text-rose-800 dark:text-rose-300',
  },
  trips: {
    heading: 'Something went wrong loading the trip planner.',
    accent: 'text-amber-800 dark:text-amber-300',
  },
}

// Renders a recovery surface when a descendant throws during render or in a
// synchronous effect (componentDidMount / useEffect body). Pair with a
// <Suspense> placed INSIDE this boundary — a lazy chunk that rejects throws
// past Suspense, and the boundary catches it here. (If Suspense were above
// this boundary, chunk-load rejections would never reach us and the user
// would see a blank page.)
//
// What this does NOT catch:
//   - Errors thrown asynchronously inside event handlers (React 19 leaves
//     those for window.onerror) → see the unhandledrejection listener below.
//   - Errors in code that runs before this boundary mounts (e.g., main.tsx).
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null }
  private reloadRef = createRef<HTMLButtonElement>()

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface to the browser console so the user (and any attached devtools)
    // can see the original stack instead of just the boundary's fallback UI.
    console.error('[RouteErrorBoundary]', this.props.app, error, info.componentStack)
  }

  componentDidUpdate(_prev: Props, prevState: State) {
    // Focus the reload button right after the fallback mounts so screen-reader
    // users land on the recovery action instead of being dropped at document
    // start with no announcement of what changed.
    if (!prevState.error && this.state.error) {
      this.reloadRef.current?.focus()
    }
  }

  private handleReload = () => {
    // Hard reload bypasses the in-memory module graph so a transient chunk-
    // load failure (e.g., a stale SW pointing at a deleted hashed asset)
    // resolves on the next request.
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    const { heading, accent } = appCopy[this.props.app]

    return (
      <div
        role="alert"
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-stone-50 px-6 py-10 text-center text-stone-900 dark:bg-stone-950 dark:text-stone-100"
      >
        <h1
          className={`max-w-md font-serif text-2xl sm:text-3xl ${accent}`}
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          {heading}
        </h1>
        <p className="max-w-md text-sm text-stone-600 dark:text-stone-400">
          A reload usually fixes this. If it keeps happening, your browser may be holding onto a
          stale asset — clear the site data and try again.
        </p>
        <button
          ref={this.reloadRef}
          type="button"
          onClick={this.handleReload}
          className="mt-2 inline-flex items-center justify-center rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-stone-50 transition hover:bg-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
        >
          Reload
        </button>
      </div>
    )
  }
}
