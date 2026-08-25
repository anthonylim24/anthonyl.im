import { sx } from '@/styles/merge'
import { layout } from '@/styles/common.stylex'

interface LiveAnnouncerProps {
  message: string
}

/**
 * Screen-reader live region for the session: protocol, round, phase, coach
 * cue, safety reminder, pause, and completion announcements.
 */
export function LiveAnnouncer({ message }: LiveAnnouncerProps) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" {...sx(layout.srOnly)}>
      {message}
    </div>
  )
}
