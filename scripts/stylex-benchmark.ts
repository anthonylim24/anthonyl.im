#!/usr/bin/env bun
/**
 * Compare frontend build output before/after StyleX migration.
 * Run from repo root: bun scripts/stylex-benchmark.ts
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import path from 'node:path'

const FRONTEND = path.join(import.meta.dir, '..', 'frontend')
const DIST = path.join(FRONTEND, 'dist')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

function bytes(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(2)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

function measure(label: string) {
  console.log(`\n=== ${label} ===\n`)
  const build = spawnSync('bun', ['run', 'build'], {
    cwd: FRONTEND,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'inherit',
  })
  if (build.status !== 0) process.exit(build.status ?? 1)

  const files = walk(DIST)
  const css = files.filter((f) => f.endsWith('.css'))
  const js = files.filter((f) => f.endsWith('.js'))
  const cssBytes = css.reduce((sum, f) => sum + statSync(f).size, 0)
  const jsBytes = js.reduce((sum, f) => sum + statSync(f).size, 0)
  const total = cssBytes + jsBytes

  const t0 = performance.now()
  for (let i = 0; i < 50; i++) {
    for (const f of css) readFileSync(f)
    for (const f of js.slice(0, 5)) readFileSync(f)
  }
  const readMs = performance.now() - t0

  console.log(`CSS files: ${css.length} (${bytes(cssBytes)})`)
  console.log(`JS files:  ${js.length} (${bytes(jsBytes)})`)
  console.log(`Total CSS+JS: ${bytes(total)}`)
  console.log(`Cold read (50× CSS + 5× JS): ${readMs.toFixed(1)} ms`)

  return { cssBytes, jsBytes, total, readMs, cssCount: css.length, jsCount: js.length }
}

const stylex = measure('StyleX build (current branch)')

console.log('\n=== StyleX migration benchmark summary ===\n')
console.log(JSON.stringify({ stylex, note: 'Compare against main branch baseline in PR description' }, null, 2))
