// Fails the build if StyleX's atomic CSS didn't land in the stylesheet that
// index.html loads (it once ended up in a lazy BreathFlow chunk, leaving every
// other route unstyled in production).
import { readFileSync } from 'node:fs'

const html = readFileSync('dist/index.html', 'utf8')
const hrefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css)"/g)].map((m) => m[1])
const base = process.env.VITE_BASE?.trim().replace(/\/$/, '') ?? ''
const css = hrefs.map((h) => readFileSync('dist' + h.slice(base.length), 'utf8')).join('\n')
if (!css.includes('@layer stylex')) {
  console.error(`StyleX CSS is missing from the entry stylesheet(s): ${hrefs.join(', ') || '(none)'}`)
  process.exit(1)
}
console.log(`StyleX CSS present in ${hrefs.join(', ')}`)
