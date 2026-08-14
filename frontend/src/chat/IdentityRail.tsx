import { withViteBase } from '@/lib/routerBasename'
import { cn } from '@/lib/utils'
import type { ResolvedTheme } from './useChatAppearance'

export const CHAT_NAME = 'Anthony Lim'
export const CHAT_POSITIONING = 'Software engineer at DoorDash, based in San Francisco.'
export const CHAT_SUBTEXT =
  'Ask this assistant about his work, the teams he has shipped with, or how to reach him.'
export const CHAT_LINKEDIN_HREF = 'https://www.linkedin.com/in/alim24/'
export const CHAT_EMAIL = 'anthonylim.ucsc@gmail.com'

interface IdentityRailProps {
  condensed: boolean
  theme: ResolvedTheme
}

const linkClass =
  'inline-flex min-h-11 items-center text-sm text-[color:var(--ch-accent)] underline-offset-4 transition-transform duration-150 hover:underline active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ch-focus)]'

export function IdentityRail({ condensed, theme }: IdentityRailProps) {
  return (
    <aside
      data-condensed={condensed ? 'true' : 'false'}
      className={cn(
        'min-w-0 px-4 pt-4 lg:flex lg:flex-col lg:justify-start lg:px-8 lg:pb-16 lg:pt-16',
        condensed ? 'pb-3' : 'pb-6',
      )}
    >
      {!condensed ? (
        <div className="mb-6 flex items-center gap-6 col-fade-in">
          <img
            src={withViteBase('/logos/doordash.svg')}
            alt="DoorDash"
            className={cn('h-7 w-auto', theme === 'dark' && 'invert')}
          />
          <img
            src={withViteBase('/logos/ebay.svg')}
            alt="eBay"
            className={cn('h-7 w-auto', theme === 'dark' && 'invert')}
          />
        </div>
      ) : null}

      <h1
        className={cn(
          'chat-display text-[color:var(--ch-ink)] tracking-tight',
          condensed
            ? 'text-xl leading-tight'
            : 'text-4xl leading-[1.1] md:text-5xl',
        )}
      >
        {CHAT_NAME}
      </h1>

      <p
        className={cn(
          'mt-2 max-w-[36ch] text-[color:var(--ch-ink-muted)]',
          condensed ? 'text-sm leading-snug' : 'text-base leading-relaxed',
        )}
      >
        {CHAT_POSITIONING}
      </p>

      {!condensed ? (
        <p className="mt-3 max-w-[40ch] text-sm leading-relaxed text-[color:var(--ch-ink-muted)]">
          {CHAT_SUBTEXT}
        </p>
      ) : null}

      {!condensed ? (
        <p className="mt-5 text-sm text-[color:var(--ch-ink)]">
          <a
            className={linkClass}
            href={CHAT_LINKEDIN_HREF}
            target="_blank"
            rel="noopener noreferrer"
          >
            LinkedIn
          </a>
          <span aria-hidden="true" className="px-2 text-[color:var(--ch-ink-faint)]">
            ·
          </span>
          <a className={linkClass} href={`mailto:${CHAT_EMAIL}`}>
            {CHAT_EMAIL}
          </a>
        </p>
      ) : null}
    </aside>
  )
}
