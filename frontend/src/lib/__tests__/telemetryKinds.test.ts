// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

// POST /api/telemetry answers 400 to any other kind (server/src/observability.ts),
// so a report with one is lost without a word.
const SERVER_KIND = /^[a-z][a-z0-9_]{1,39}$/

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sources(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe("telemetry kinds", () => {
  it("are all ones the server accepts", () => {
    const kinds = sources(resolve(process.cwd(), "src")).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/reportClientEvent\(\s*["'`]([^"'`]+)["'`]/g)].map((match) => match[1]),
    )
    expect(kinds.length).toBeGreaterThan(5)
    expect(kinds.filter((kind) => !SERVER_KIND.test(kind))).toEqual([])
  })
})
