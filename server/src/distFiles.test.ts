import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createBoundedMemo, createDistReader } from "./distFiles"

const dirs: string[] = []
async function distWith(files: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), "dist-"))
  dirs.push(dir)
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text)
  return dir
}
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })))
})

describe("createDistReader", () => {
  test("memoised: reads and transforms once, then ignores the disk", async () => {
    const dir = await distWith({ "index.html": "v1" })
    let transforms = 0
    const read = createDistReader(dir, { memoise: true })
    const upper = (t: string) => (transforms++, t.toUpperCase())
    expect(await read("index.html", upper)).toBe("V1")
    await writeFile(join(dir, "index.html"), "v2")
    expect(await read("index.html", upper)).toBe("V1")
    expect(transforms).toBe(1)
  })

  test("not memoised (development): a rebuild shows on the next request", async () => {
    const dir = await distWith({ "sw.js": "v1" })
    const read = createDistReader(dir, { memoise: false })
    expect(await read("sw.js")).toBe("v1")
    await writeFile(join(dir, "sw.js"), "v2")
    expect(await read("sw.js")).toBe("v2")
  })

  test("a missing file throws and is not cached", async () => {
    const dir = await distWith({})
    const read = createDistReader(dir, { memoise: true })
    await expect(read("home.html")).rejects.toThrow()
    await writeFile(join(dir, "home.html"), "here now")
    expect(await read("home.html")).toBe("here now")
  })
})

describe("createBoundedMemo", () => {
  test("holds at most max entries, dropping the oldest", () => {
    const memo = createBoundedMemo<string>(2, { enabled: true })
    let made = 0
    const make = (v: string) => () => (made++, v)
    memo.get("/a", make("A"))
    memo.get("/b", make("B"))
    memo.get("/c", make("C"))
    expect(memo.size()).toBe(2)
    expect(memo.get("/c", make("C2"))).toBe("C")
    expect(memo.get("/a", make("A2"))).toBe("A2")
    expect(made).toBe(4)
  })

  test("disabled: always makes, never holds", () => {
    const memo = createBoundedMemo<string>(2, { enabled: false })
    expect(memo.get("/a", () => "1")).toBe("1")
    expect(memo.get("/a", () => "2")).toBe("2")
    expect(memo.size()).toBe(0)
  })
})
