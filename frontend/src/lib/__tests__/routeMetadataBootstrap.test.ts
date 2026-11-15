// The inline route-metadata scripts in index.html, run the way a browser meets
// them in production: before the server-injected tags at the end of <head>.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BREATHFLOW_ROUTE_METADATA } from '../routeMetadata'

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
const scripts = [...html.matchAll(/<script data-route-metadata="\w+">([\s\S]*?)<\/script>/g)].map((m) => m[1]!)

function serverTags(title: string, description: string) {
  return `
    <meta name="description" content="${description}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="apple-mobile-web-app-title" content="${title}" />`
}

function boot(path: string, injected: string) {
  window.history.replaceState(null, '', path)
  document.head.innerHTML = '<meta name="application-name" content="Korea Trip" /><link rel="icon" type="image/svg+xml" href="/favicon-chat.svg" />'
  Object.defineProperty(document, 'readyState', { configurable: true, get: () => 'loading' })
  for (const code of scripts) new Function(code)()
  document.head.insertAdjacentHTML('beforeend', injected)
  Object.defineProperty(document, 'readyState', { configurable: true, get: () => 'interactive' })
  document.dispatchEvent(new Event('DOMContentLoaded'))
}

const contents = (selector: string) =>
  [...document.head.querySelectorAll(selector)].map((tag) => tag.getAttribute('content'))

afterEach(() => {
  delete (document as unknown as { readyState?: unknown }).readyState
  document.head.innerHTML = ''
})

describe('route metadata bootstrap', () => {
  it('ships three scripts, the shared helper first', () => {
    expect(scripts).toHaveLength(3)
    expect(scripts[0]).toContain('window.__setRouteMeta =')
  })

  it('leaves one tag of each kind next to the server-injected ones', () => {
    const { title, description } = BREATHFLOW_ROUTE_METADATA
    boot('/breathwork', serverTags(title, description))

    for (const selector of [
      'meta[name="description"]',
      'meta[property="og:title"]',
      'meta[property="og:description"]',
      'meta[name="twitter:title"]',
      'meta[name="twitter:description"]',
    ]) {
      expect(contents(selector)).toHaveLength(1)
    }
    expect(contents('meta[name="description"]')).toEqual([description])
    expect(document.title).toBe(title)
  })

  it('keeps the trip install name short over the server title', () => {
    boot('/trips', serverTags('Trips — plan a trip, pin by pin', 'Plan trips'))
    expect(contents('meta[name="apple-mobile-web-app-title"]')).toEqual(['Trips'])
    expect(contents('meta[name="application-name"]')).toEqual(['Trips'])
  })

  it('removes duplicates it did not write', () => {
    boot('/', `${serverTags('Lim', 'Meet Lim')}${serverTags('Lim', 'Meet Lim')}`)
    expect(contents('meta[property="og:title"]')).toEqual(['Lim'])
    expect(contents('meta[name="description"]')).toEqual(['Meet Lim'])
  })

  it('creates the tags in dev, where nothing is injected', () => {
    boot('/trips/korea-2026', '')
    expect(contents('meta[property="og:title"]')).toEqual(['Seoul + Busan — Korea 2026 trip dossier'])
    expect(contents('meta[name="apple-mobile-web-app-title"]')).toEqual(['Korea Trip'])
  })
})
