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
    ['/lab/', 'lab', 'Loading the lab'],
    ['/lab/specimen', 'lim', 'Loading Lim'],
    ['/trips/', 'trips', 'Loading Trips'],
    ['/tripsfoo', 'lim', 'Loading Lim'],
    ['/breathworks', 'lim', 'Loading Lim'],
    ['/sign-in/', 'auth', 'Loading sign-in'],
    ['/sign-in-help', 'lim', 'Loading Lim'],
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

  it.each([
    ['/trips/korea-2026', '{"korea-2026":"rose"}', 'rose'],
    ['/preview/pr/12/trips/korea-2026/day/3', '{"korea-2026":"rose"}', 'rose'],
    ['/trips', '{"korea-2026":"rose"}', null],
    ['/trips/tokyo', '{"korea-2026":"rose"}', null],
    ['/trips/korea-2026', 'not json', null],
  ])('at %s with remembered accents %s is tinted %s', (path, remembered, accent) => {
    prefersDark(false)
    localStorage.setItem('trips-boot-accent', remembered)
    const boot = paintBoot(path)
    if (accent) expect(boot).toHaveAttribute('data-accent', accent)
    else expect(boot).not.toHaveAttribute('data-accent')
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

  it('draws in web faces only for a world whose fonts this browser has loaded before', () => {
    prefersDark(false)
    expect(paintBoot('/trips')).not.toHaveAttribute('data-fonts')
    clearBoot()
    localStorage.setItem('boot-fonts', '["trips","lab"]')
    expect(paintBoot('/trips/korea-2026')).toHaveAttribute('data-fonts')
    clearBoot()
    localStorage.setItem('boot-fonts', '["trips","lab"]')
    expect(paintBoot('/breathwork')).not.toHaveAttribute('data-fonts')
    clearBoot()
    localStorage.setItem('boot-fonts', 'not json')
    expect(paintBoot('/lab')).not.toHaveAttribute('data-fonts')
  })

  it('names web faces only under [data-fonts], and lists them on the template', () => {
    const webFace = /Fragment Mono|Instrument Serif|Archivo|Fraunces|Geist|Inter\b/
    const page = new DOMParser().parseFromString(indexHtml.slice(indexHtml.indexOf('</head>')), 'text/html')
    const headCss = [...indexHtml.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).find((css) => css!.includes('.boot {'))!
    const sources = [
      { id: 'head', css: headCss, markup: '', fonts: '' },
      ...[...page.querySelectorAll<HTMLTemplateElement>('template[id^="boot-"]')].map((template) => ({
        id: template.id,
        css: [...template.content.querySelectorAll('style')].map((style) => style.textContent).join(''),
        markup: template.innerHTML,
        fonts: template.dataset.fonts ?? '',
      })),
    ]
    for (const { id, css, markup, fonts } of sources) {
      const unguarded = css
        .split('}')
        .map((rule) => rule.split('{').slice(-2))
        .filter(([selector, body]) => body && webFace.test(body) && !selector!.includes('[data-fonts]'))
        .map(([selector]) => selector!.trim())
      expect(unguarded, id).toEqual([])
      expect(markup.match(/font-family="[^"]*"/g)?.filter((attr) => webFace.test(attr)) ?? [], id).toEqual([])
      if (webFace.test(css)) expect(fonts, id).not.toBe('')
    }
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
