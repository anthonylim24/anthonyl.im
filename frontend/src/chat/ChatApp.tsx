import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { getPostHogConfig } from '@/lib/analytics'
import { CHAT_THEME_COLORS, syncThemeColor } from '@/lib/themeColor'
import { cn } from '@/lib/utils'
import { useFavicon } from '@/hooks/useFavicon'
import { Composer } from './Composer'
import { Conversation } from './Conversation'
import { IdentityRail } from './IdentityRail'
import { LeafAmbience } from './LeafAmbience'
import { useChatAppearance } from './useChatAppearance'
import { useChatSession } from './useChatSession'

export function ChatApp() {
  useFavicon()
  const { pathname } = useLocation()
  const appearance = useChatAppearance()
  const session = useChatSession()
  const hasMessages = session.messages.length > 0

  useEffect(() => {
    syncThemeColor(appearance.theme, CHAT_THEME_COLORS)
  }, [appearance.theme, pathname])

  useEffect(() => {
    const postHogConfig = getPostHogConfig()
    if (postHogConfig) {
      import('posthog-js')
        .then(({ default: ph }) =>
          ph.init(postHogConfig.key, {
            api_host: postHogConfig.apiHost,
            person_profiles: 'identified_only',
          }),
        )
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (event.key === 'd' || event.key === 'D') appearance.toggleTheme()
      if (event.key === 'a' || event.key === 'A') appearance.toggleAmbience()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [appearance.toggleTheme, appearance.toggleAmbience])

  return (
    <div
      className={cn(
        'chat relative min-h-[100dvh] overflow-hidden',
        appearance.theme === 'dark' ? 'chat-dark' : 'chat-light',
      )}
      style={{ height: '100dvh' }}
    >
      <LeafAmbience enabled={appearance.ambience} />
      <div className="chat-grain" aria-hidden="true" />

      {/* The rail hands its width back to the transcript once a conversation
          exists: a state transition, not decoration. */}
      <div
        className={cn(
          'relative z-10 mx-auto grid h-full min-h-0 w-full max-w-[1400px] grid-cols-1 grid-rows-[auto_minmax(0,1fr)] safe-top lg:grid-rows-1',
          'transition-[grid-template-columns] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
          hasMessages
            ? 'lg:grid-cols-[minmax(13rem,17rem)_1fr]'
            : 'lg:grid-cols-[minmax(18rem,26rem)_1fr]',
        )}
      >
        <IdentityRail condensed={hasMessages} theme={appearance.theme} />
        <div className="flex min-h-0 min-w-0 flex-col">
          <Conversation
            messages={session.messages}
            isLoading={session.isLoading}
            error={session.error}
            onRetry={session.retry}
          />
          <Composer
            hasMessages={hasMessages}
            isLoading={session.isLoading}
            theme={appearance.theme}
            ambience={appearance.ambience}
            onSend={session.send}
            onToggleTheme={appearance.toggleTheme}
            onToggleAmbience={appearance.toggleAmbience}
            onClear={hasMessages ? session.clear : undefined}
          />
        </div>
      </div>
    </div>
  )
}
