import { Component, createRef, type ErrorInfo, type ReactNode } from 'react'
import { sx } from '@/lib/utils'
import { routeError } from '@/styles/chatbot.stylex'

interface Props {
  /** Which app this boundary protects — drives accent color + copy. */
  app: 'chatbot' | 'breathwork' | 'korea' | 'trips'
  children: ReactNode
}

interface State {
  error: Error | null
}

const appCopy: Record<Props['app'], { heading: string }> = {
  chatbot: {
    heading: 'The chat did not load.',
  },
  breathwork: {
    heading: 'Couldn\'t load BreathFlow.',
  },
  korea: {
    heading: 'The Korea itinerary moved to /trips/korea-2026.',
  },
  trips: {
    heading: 'Something went wrong loading the trip planner.',
  },
}

const headingStyles: Record<Props['app'], Parameters<typeof sx>[0]> = {
  chatbot: routeError.headingChatbot,
  breathwork: routeError.headingBreathwork,
  korea: routeError.headingKorea,
  trips: routeError.headingTrips,
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

    const { heading } = appCopy[this.props.app]

    return (
      <div role="alert" {...sx(routeError.root)}>
        <h1 {...sx(routeError.heading, headingStyles[this.props.app])}>
          {heading}
        </h1>
        <p {...sx(routeError.body)}>
          A reload usually fixes this. If it keeps happening, clear site data and try again.
        </p>
        <button
          ref={this.reloadRef}
          type="button"
          onClick={this.handleReload}
          {...sx(routeError.reloadBtn)}
        >
          Reload
        </button>
      </div>
    )
  }
}
