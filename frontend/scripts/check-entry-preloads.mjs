// Fails the build if the entry HTML preloads a chunk that only some routes
// need. Every route pays for what `dist/index.html` preloads, so the heavy or
// route-specific vendor groups (see docs/bundles.md) must stay lazy. Also
// prints what the entry costs, raw and gzipped, for the bundle notes.
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const LAZY_ONLY = ['motion', 'radix', 'supabase', 'maplibre', 'three', 'tiles3d', 'photoreal']

const html = readFileSync('dist/index.html', 'utf8')
const base = process.env.VITE_BASE?.trim().replace(/\/$/, '') ?? ''
const href = (tag) => tag.match(/(?:href|src)="([^"]+)"/)?.[1]
const preloads = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]*>/g)].map((m) => href(m[0]))
const entries = [...html.matchAll(/<script[^>]+type="module"[^>]*>/g)].map((m) => href(m[0]))
const files = [...entries, ...preloads].filter((f) => f?.startsWith(`${base}/assets/`))

// Chunk names are `<group>-<hash>.js`; `three-core` and `three-webgpu` count as three.
const group = (file) => file.split('/').pop().replace(/-[\w-]{8}\.js$/, '')
const banned = preloads.filter((file) => LAZY_ONLY.some((name) => group(file) === name || group(file).startsWith(`${name}-`)))

let raw = 0
let gz = 0
for (const file of files) {
  const bytes = readFileSync('dist' + file.slice(base.length))
  const size = gzipSync(bytes).length
  raw += bytes.length
  gz += size
  console.log(`  ${(size / 1024).toFixed(1).padStart(7)} kB gz  ${file.slice(base.length)}`)
}
console.log(`Entry JS: ${(raw / 1024).toFixed(1)} kB, ${(gz / 1024).toFixed(1)} kB gzip (${files.length} files)`)

if (banned.length) {
  console.error(`dist/index.html preloads lazy-only chunks: ${banned.join(', ')}`)
  console.error('Something in the entry graph imports them statically; see docs/bundles.md.')
  process.exit(1)
}
