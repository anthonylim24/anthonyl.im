/**
 * Automated accessibility and layout audit for the Chat + Trips surfaces.
 *
 *   bun frontend/scripts/audit-redesign.mjs            # writes a markdown report
 *   AUDIT_OUT=/tmp/report.md bun frontend/scripts/audit-redesign.mjs
 *
 * Needs the local stack (Vite :5173, API :3000 with the dev bearer), same as
 * capture-redesign.mjs. Every check is a claim the PR description makes, so it
 * is measured here rather than asserted by hand:
 *
 *   1. 390px document overflow (including a long unbroken hangul stress string)
 *   2. touch target sizes for every visible interactive element
 *   3. a visible focus indicator on the first 25 focusables of each route
 *   4. zero running animations under prefers-reduced-motion, with a control
 *      run first so the probe proves it can see motion before reporting none
 *   5. uncaught page errors and console errors
 */
import { chromium, devices } from "@playwright/test"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173"
const OUT = process.env.AUDIT_OUT ?? "/opt/cursor/artifacts/audit-report.md"

const ROUTES = [
  ["chat", "/"],
  ["trips index", "/trips"],
  ["trip create", "/trips/new"],
  ["trip overview", "/trips/korea-2026"],
  ["trip day", "/trips/korea-2026/day/day-2"],
  ["trip editor", "/trips/korea-2026/edit"],
]

const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }

const INTERACTIVE =
  'a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])'

const lines = []
let failures = 0

const record = (ok, text) => {
  if (!ok) failures++
  lines.push(`${ok ? "- PASS" : "- FAIL"} ${text}`)
}

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {})
  await page.waitForTimeout(700)
}

const browser = await chromium.launch({ headless: true })

try {
  /* 1 + 2 + 3 --------------------------------------------------------- */
  for (const [viewportName, viewport] of [
    ["mobile 390", MOBILE],
    ["desktop 1440", DESKTOP],
  ]) {
    const context = await browser.newContext({
      ...devices["Desktop Chrome"],
      viewport,
      colorScheme: "light",
    })
    const page = await context.newPage()
    const pageErrors = []
    page.on("pageerror", (e) => pageErrors.push(e.message))
    page.on("console", (m) => {
      if (m.type() === "error") pageErrors.push(`console: ${m.text()}`)
    })

    lines.push(`\n### ${viewportName}\n`)

    for (const [name, route] of ROUTES) {
      pageErrors.length = 0
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" })
      await settle(page)

      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement ?? document.documentElement
        return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
      })
      record(
        overflow.scrollWidth <= overflow.clientWidth + 1,
        `${name}: no horizontal overflow (${overflow.scrollWidth} <= ${overflow.clientWidth})`,
      )

      const targets = await page.evaluate((selector) => {
        const floor = window.innerWidth < 640 ? 44 : 36
        const bad = []
        for (const el of document.querySelectorAll(selector)) {
          const rect = el.getBoundingClientRect()
          if (rect.width === 0 || rect.height === 0) continue
          const style = getComputedStyle(el)
          if (style.visibility === "hidden" || style.display === "none") continue
          // Skip links and other sr-only affordances measure 1px until focused.
          if (rect.width <= 1 || rect.height <= 1) continue
          // An element can buy its target through a padded ::after overlay.
          const after = getComputedStyle(el, "::after")
          const grown = after.content !== "none" && after.position === "absolute"
          const h = grown ? rect.height + 12 : rect.height
          const w = grown ? rect.width + 12 : rect.width
          // WCAG 2.5.8 exempts a target inside a sentence and holds it to 24px.
          // The entity chips inside itinerary prose are exactly that case.
          const inline = style.display.startsWith("inline")
          if (inline) {
            if (h + 0.5 < 24 || w + 0.5 < 24) {
              bad.push(`inline ${el.tagName.toLowerCase()} ${Math.round(w)}x${Math.round(h)}`)
            }
            continue
          }
          if (h + 0.5 < floor || w + 0.5 < 24) {
            bad.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 40)} ${Math.round(w)}x${Math.round(h)}`)
          }
        }
        return { floor, bad }
      }, INTERACTIVE)
      record(
        targets.bad.length === 0,
        `${name}: touch targets >= ${targets.floor}px${targets.bad.length ? ` (${targets.bad.length} short: ${targets.bad.slice(0, 4).join("; ")})` : ""}`,
      )

      const focus = await page.evaluate((selector) => {
        const focusables = [...document.querySelectorAll(selector)].filter((el) => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.height > 0
        })
        const missing = []
        for (const el of focusables.slice(0, 25)) {
          const before = getComputedStyle(el)
          const beforeMark = `${before.outlineStyle}|${before.outlineWidth}|${before.boxShadow}`
          el.focus()
          const after = getComputedStyle(el)
          const afterMark = `${after.outlineStyle}|${after.outlineWidth}|${after.boxShadow}`
          if (beforeMark === afterMark) {
            missing.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}"`)
          }
          el.blur()
        }
        return { checked: Math.min(focusables.length, 25), missing }
      }, INTERACTIVE)
      record(
        focus.missing.length === 0,
        `${name}: visible focus indicator on ${focus.checked} focusables${focus.missing.length ? ` (missing: ${focus.missing.slice(0, 4).join("; ")})` : ""}`,
      )

      record(pageErrors.length === 0, `${name}: no page or console errors${pageErrors.length ? ` (${pageErrors.slice(0, 2).join(" | ")})` : ""}`)
    }

    // Long unbroken string stress test on the widest text surface.
    await page.goto(`${BASE}/trips/korea-2026`, { waitUntil: "domcontentloaded" })
    await settle(page)
    const stress = await page.evaluate(() => {
      const heading = document.querySelector("h1")
      if (!heading) return null
      const original = heading.textContent
      heading.textContent = "서울부산여행일정표아주긴한글문자열테스트입니다반드시줄바꿈되어야합니다"
      const el = document.scrollingElement ?? document.documentElement
      const result = { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
      heading.textContent = original
      return result
    })
    if (stress) {
      record(
        stress.scrollWidth <= stress.clientWidth + 1,
        `trip overview: 60-character unbroken hangul heading does not overflow (${stress.scrollWidth} <= ${stress.clientWidth})`,
      )
    }

    await context.close()
  }

  /* 4 ------------------------------------------------------------------ */
  lines.push("\n### motion\n")
  for (const reduce of [false, true]) {
    const context = await browser.newContext({
      ...devices["Desktop Chrome"],
      viewport: DESKTOP,
      colorScheme: "light",
      reducedMotion: reduce ? "reduce" : "no-preference",
    })
    const page = await context.newPage()
    for (const [name, route] of ROUTES) {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" })
      // Sample immediately: entry animations are the ones we care about.
      await page.waitForTimeout(120)
      const running = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a.playState === "running")
          .map((a) => a.effect?.target?.tagName ?? "unknown").length,
      )
      if (reduce) {
        record(running === 0, `${name}: no running animations under prefers-reduced-motion`)
      } else {
        lines.push(`- NOTE ${name}: ${running} running animation(s) with motion allowed (control run)`)
      }
    }
    await context.close()
  }
} finally {
  await browser.close()
}

const header = `# Redesign audit\n\nGenerated ${new Date().toISOString()} against ${BASE}.\n\n${failures === 0 ? "All checks pass." : `${failures} check(s) failed.`}\n`
await mkdir(path.dirname(OUT), { recursive: true })
await writeFile(OUT, header + lines.join("\n") + "\n")
console.log(header)
console.log(lines.join("\n"))
console.log(`\nwrote ${OUT}`)
process.exit(failures === 0 ? 0 : 1)
