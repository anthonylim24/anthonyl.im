import { Component, type ReactNode } from "react"

interface Props {
  /** Called once when the overlay throws; close it and tell the user. */
  onError: (error: Error) => void
  children: ReactNode
}

/**
 * Contains an optional overlay (a lazy sheet, the 3D view). When it fails to
 * load or throws while rendering, only the overlay goes away: the page under
 * it keeps working. The parent unmounts this boundary by closing the overlay,
 * so the next open starts clean.
 */
export class OverlayBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    console.error("[OverlayBoundary]", error)
    this.props.onError(error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
