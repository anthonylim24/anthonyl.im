import { describe, expect, test } from "bun:test"
import { parseDevBearer } from "./config"

describe("parseDevBearer", () => {
  test("extracts a plain value", () => {
    expect(parseDevBearer("VITE_CLERK_PUBLISHABLE_KEY=pk_x\nVITE_DEV_BEARER=dev\n")).toBe("dev")
  })

  test("handles quotes and whitespace", () => {
    expect(parseDevBearer('  VITE_DEV_BEARER = "my-token"  \n')).toBe("my-token")
    expect(parseDevBearer("VITE_DEV_BEARER='tok'\n")).toBe("tok")
  })

  test("returns undefined when missing or empty", () => {
    expect(parseDevBearer("VITE_CLERK_PUBLISHABLE_KEY=pk_x\n")).toBeUndefined()
    expect(parseDevBearer("VITE_DEV_BEARER=\n")).toBeUndefined()
    expect(parseDevBearer("")).toBeUndefined()
  })

  test("does not match commented lines", () => {
    expect(parseDevBearer("# VITE_DEV_BEARER=nope\n")).toBeUndefined()
  })
})

import { createClerkAuth, verifyClerkOptional } from "./middleware/clerkAuth"
import { Hono } from "hono"

describe("dev bearer arrays", () => {
  test("verifyClerkOptional accepts any bearer in the array", async () => {
    const deps = { devBearer: ["long-token", "dev"], devUserId: "dev-user" }
    expect(await verifyClerkOptional("Bearer dev", deps)).toBe("dev-user")
    expect(await verifyClerkOptional("Bearer long-token", deps)).toBe("dev-user")
    expect(await verifyClerkOptional("Bearer other", { ...deps, verifyToken: async () => { throw new Error("bad") } })).toBeNull()
  })

  test("createClerkAuth accepts any bearer in the array", async () => {
    const app = new Hono()
    app.use("*", createClerkAuth({ devBearer: ["a", "b"], devUserId: "u1" }))
    app.get("/", (c) => c.json({ ok: true }))
    expect((await app.request("/", { headers: { Authorization: "Bearer b" } })).status).toBe(200)
  })
})
