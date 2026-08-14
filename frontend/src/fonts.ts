/**
 * Self-hosted webfonts.
 *
 * The site used to pull these from `fonts.googleapis.com` with a render-blocking
 * `<link>` in index.html. Fontsource ships the same OFL files as versioned npm
 * packages, so Vite fingerprints them, serves them same-origin, and no third
 * party sees a visitor's IP. Every face below declares `font-display: swap`.
 *
 * Who uses what:
 *   Geist Variable            body type in the chat app and Trips
 *   Geist Mono Variable       numerals, times, and labels in the chat app and Trips
 *   Bricolage Grotesque       display type in Trips
 *   Inter Variable            body type inherited by the Korea dossier
 *   Cormorant Garamond        display type in the Korea dossier
 *   Fragment Mono             mono type in the Korea dossier and BreathFlow
 *
 * Variable packages expose one file per axis (`wght.css`); their `unicode-range`
 * declarations keep the non-latin files from ever being fetched, so there is no
 * per-subset entry point to import. Static families do have subset entry points,
 * so those are pinned to `latin` at the exact weights the design uses.
 */
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import '@fontsource-variable/bricolage-grotesque/wght.css'
import '@fontsource-variable/inter/wght.css'

import '@fontsource/cormorant-garamond/latin-300.css'
import '@fontsource/cormorant-garamond/latin-400.css'
import '@fontsource/cormorant-garamond/latin-500.css'
import '@fontsource/cormorant-garamond/latin-600.css'
import '@fontsource/cormorant-garamond/latin-700.css'
import '@fontsource/cormorant-garamond/latin-300-italic.css'
import '@fontsource/cormorant-garamond/latin-400-italic.css'

import '@fontsource/fragment-mono/latin-400.css'
import '@fontsource/fragment-mono/latin-400-italic.css'
