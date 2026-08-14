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
        'min-w-0 px-4 pt-4 lg:flex lg:flex-col lg:px-8 lg:pb-16 lg:pt-16',
        // At rest the hero sits on the optical centre of its column; once the
        // transcript owns the page the rail rides at the top out of the way.
        condensed ? 'pb-3 lg:justify-start' : 'pb-6 lg:justify-center',
      )}
    >
      {!condensed ? (
        <div className="mb-7 flex items-center gap-5 col-fade-in">
          <img
            src={withViteBase('/logos/doordash.svg')}
            alt="DoorDash"
            width={24}
            height={24}
            className={cn('h-5 w-auto opacity-80', theme === 'dark' && 'invert')}
          />
          <img
            src={withViteBase('/logos/ebay.svg')}
            alt="eBay"
            width={24}
            height={24}
            className={cn('h-6 w-auto opacity-80', theme === 'dark' && 'invert')}
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

      <p className={cn('text-sm text-[color:var(--ch-ink)]', condensed ? 'mt-3' : 'mt-5')}>
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
          {condensed ? 'Email' : CHAT_EMAIL}
        </a>
      </p>
    </aside>
  )
}
