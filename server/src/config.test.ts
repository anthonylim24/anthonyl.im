import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { parseDevBearer, resolveDevBearers } from "./config"
import { createClerkAuth, verifyClerkOptional } from "./middleware/clerkAuth"

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

describe("resolveDevBearers", () => {
  test("accepts IG_DEV_BEARER and process VITE_DEV_BEARER when they differ", () => {
    expect(
      resolveDevBearers(
        { NODE_ENV: "development", IG_DEV_BEARER: "ig-token", VITE_DEV_BEARER: "vite-token" },
        undefined,
      ),
    ).toEqual(["ig-token", "vite-token"])
  })

  test("reads VITE_DEV_BEARER from the environment when frontend/.env is missing", () => {
    expect(
      resolveDevBearers({ NODE_ENV: "development", VITE_DEV_BEARER: "vite-only" }, undefined),
    ).toBe("vite-only")
  })

  test("ignores VITE_DEV_BEARER and file bearers in production", () => {
    expect(
      resolveDevBearers(
        { NODE_ENV: "production", IG_DEV_BEARER: "ig-token", VITE_DEV_BEARER: "vite-token" },
        "file-token",
      ),
    ).toBe("ig-token")
  })
})

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
