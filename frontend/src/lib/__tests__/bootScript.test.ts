import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearBoot, indexHtml, paintBoot } from '@/test/bootPage'

function prefersDark(dark: boolean) {
  const matchMedia = (query: string) =>
    ({ matches: dark && query === '(prefers-color-scheme: dark)', media: query }) as MediaQueryList
  vi.stubGlobal('matchMedia', matchMedia)
}

afterEach(() => {
  clearBoot()
  vi.unstubAllGlobals()
})

describe('the boot screen index.html paints', () => {
  it.each([
    ['/', 'lim', 'Loading Lim'],
    ['/lab', 'lab', 'Loading the lab'],
    ['/breathwork/session', 'breathwork', 'Loading BreathFlow'],
    ['/trips', 'trips', 'Loading Trips'],
    ['/korea', 'trips', 'Loading Trips'],
    ['/sign-in', 'auth', 'Loading sign-in'],
    ['/sign-up', 'auth', 'Loading sign-in'],
    ['/preview/pr/12/trips', 'trips', 'Loading Trips'],
    ['/preview/pr/12', 'lim', 'Loading Lim'],
    ['/some-404', 'lim', 'Loading Lim'],
  ])('at %s is the %s screen', (path, world, label) => {
    prefersDark(false)
    const boot = paintBoot(path)
    expect(boot).toHaveAttribute('data-world', world)
    expect(boot).toHaveAttribute('role', 'status')
    expect(boot).toHaveAttribute('aria-label', label)
    expect(boot).toHaveAttribute('aria-busy', 'true')
    expect(boot).toHaveAttribute('data-theme', 'light')
    expect(boot).toHaveAttribute('data-step', 'start')
    expect(boot).toHaveAttribute('data-state', 'showing')
    expect(boot).not.toHaveAttribute('data-accent')
    expect(boot.nextElementSibling).toBe(document.getElementById('root'))
    expect(document.querySelectorAll('#boot')).toHaveLength(1)
  })

  it('tints a trip in the accent it last opened with, and nothing else', () => {
    prefersDark(false)
    localStorage.setItem('trips-boot-accent', '{"korea-2026":"rose"}')
    expect(paintBoot('/trips/korea-2026')).toHaveAttribute('data-accent', 'rose')
    clearBoot()
    localStorage.setItem('trips-boot-accent', '{"korea-2026":"rose"}')
    expect(paintBoot('/preview/pr/12/trips/korea-2026/day/3')).toHaveAttribute('data-accent', 'rose')
    clearBoot()
    localStorage.setItem('trips-boot-accent', '{"korea-2026":"rose"}')
    expect(paintBoot('/trips')).not.toHaveAttribute('data-accent')
    clearBoot()
    localStorage.setItem('trips-boot-accent', '{"korea-2026":"rose"}')
    expect(paintBoot('/trips/tokyo')).not.toHaveAttribute('data-accent')
    clearBoot()
    localStorage.setItem('trips-boot-accent', 'not json')
    expect(paintBoot('/trips/korea-2026')).not.toHaveAttribute('data-accent')
  })

  it.each([
    ['/trips', 'korea-theme', 'dark', false, 'dark'],
    ['/trips', 'korea-theme', 'system', true, 'dark'],
    ['/trips', null, null, true, 'dark'],
    ['/trips', 'korea-theme', 'light', true, 'light'],
    ['/trips', 'korea-theme', 'system', false, 'light'],
    ['/breathwork', 'breathwork-settings', '{"state":{"theme":"dark"}}', false, 'dark'],
    ['/breathwork', 'breathwork-settings', '{"state":{"theme":"light"}}', true, 'light'],
    ['/breathwork', 'breathwork-settings', 'not json', false, 'light'],
    ['/', 'lim-chat-night', '1', false, 'dark'],
    ['/', 'lim-chat-night', '0', true, 'light'],
    ['/lab', 'lim-chat-night', '1', true, 'light'],
  ])('at %s with %s=%s (system dark: %s) is %s', (path, key, value, systemDark, theme) => {
    prefersDark(systemDark)
    if (key && value) localStorage.setItem(key, value)
    expect(paintBoot(path)).toHaveAttribute('data-theme', theme)
  })

  it('paints nothing without JavaScript: the noscript page is all a visitor sees', () => {
    const body = indexHtml.slice(indexHtml.indexOf('</head>'))
    const page = new DOMParser().parseFromString(body, 'text/html')
    expect(page.querySelector('noscript')).not.toBeNull()
    expect(page.getElementById('boot')).toBeNull()
    expect(page.querySelectorAll('template[id^="boot-"]').length).toBeGreaterThan(0)
    expect(page.body.querySelector('.boot-stage')).toBeNull()
  })
})
