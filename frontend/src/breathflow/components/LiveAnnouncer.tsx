interface LiveAnnouncerProps {
  message: string
}

/**
 * Screen-reader live region for the session: protocol, round, phase, coach
 * cue, safety reminder, pause, and completion announcements.
 */
export function LiveAnnouncer({ message }: LiveAnnouncerProps) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  )
}
