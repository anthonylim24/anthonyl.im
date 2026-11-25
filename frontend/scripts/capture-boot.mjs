// Screenshots of every boot screen: each world in light and dark, on a phone and a desktop, moving and under
// reduced motion. Blocks the app's scripts, so each page stays on its boot screen for as long as needed.
//
//   node scripts/capture-boot.mjs <out-dir> [--base http://localhost:5173] [--worlds lab,trips] [--at 3000] [--cached]
//
// --cached draws each screen as a returning visitor sees it, in the web faces it lists in data-fonts.
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const [out, ...rest] = process.argv.slice(2)
if (!out) throw new Error('usage: node scripts/capture-boot.mjs <out-dir> [--base url] [--worlds a,b] [--at ms]')
const args = Object.fromEntries(rest.reduce((pairs, a, i, all) => (a.startsWith('--') ? [...pairs, [a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1]]] : pairs), []))
const CACHED = 'cached' in args
const BASE = args.base ?? 'http://localhost:5173'
const AT = Number(args.at ?? 3000)
const WORLDS = (args.worlds ?? 'lim,lab,breathwork,trips,trips-korea,auth').split(',')

/** Where each world is mounted, and the stored preference that turns it dark. */
const SETUPS = {
  lim: { path: '/', dark: ['lim-chat-night', '1'] },
  lab: { path: '/lab' },
  breathwork: { path: '/breathwork', dark: ['breathwork-settings', JSON.stringify({ state: { theme: 'dark' } })] },
  trips: { path: '/trips', dark: ['korea-theme', 'dark'], light: ['korea-theme', 'light'] },
  'trips-korea': { path: '/trips/korea-2026', dark: ['korea-theme', 'dark'], light: ['korea-theme', 'light'], accent: { 'korea-2026': 'rose' } },
  auth: { path: '/sign-in' },
}
const VIEWPORTS = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } }

await mkdir(out, { recursive: true })
const browser = await chromium.launch()
for (const name of WORLDS) {
  const setup = SETUPS[name]
  for (const theme of setup.dark ? ['light', 'dark'] : ['light']) {
    for (const [device, viewport] of Object.entries(VIEWPORTS)) {
      for (const motion of ['moving', 'reduced']) {
        const context = await browser.newContext({ viewport, deviceScaleFactor: 2, reducedMotion: motion === 'reduced' ? 'reduce' : 'no-preference' })
        const page = await context.newPage()
        await page.goto(BASE + '/home', { waitUntil: 'domcontentloaded' })
        await page.evaluate(({ setup, theme, cached }) => {
          localStorage.clear()
          const pref = theme === 'dark' ? setup.dark : setup.light
          if (pref) localStorage.setItem(pref[0], pref[1])
          if (setup.accent) localStorage.setItem('trips-boot-accent', JSON.stringify(setup.accent))
          if (cached) localStorage.setItem('boot-fonts', JSON.stringify(['lab', 'breathwork', 'trips', 'auth']))
        }, { setup, theme, cached: CACHED })
        await page.route(/\/(assets|src)\//, (route) => {
          // A held stylesheet in a build's <head> would hold the boot script behind it too.
          if (route.request().resourceType() !== 'script') return route.continue()
        })
        await page.goto(BASE + setup.path, { waitUntil: 'commit' })
        await page.waitForSelector('#boot')
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(AT)
        const file = join(out, `${name}-${theme}-${device}-${motion}${CACHED ? '-cached' : ''}.png`)
        await page.screenshot({ path: file })
        console.log(file)
        await context.close()
      }
    }
  }
}
await browser.close()
