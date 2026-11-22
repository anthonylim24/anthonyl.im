import { expect, test } from "bun:test"
import { createShutdown, type ShutdownHost } from "./shutdown"

function fakeHost() {
  const listeners = new Map<string, Array<() => void>>()
  const exits: number[] = []
  const host: ShutdownHost = {
    on(signal, listener) {
      listeners.set(signal, [...(listeners.get(signal) ?? []), listener])
    },
    exit(code) {
      exits.push(code)
    },
  }
  const send = (signal: "SIGTERM" | "SIGINT") => listeners.get(signal)?.forEach((listener) => listener())
  return { host, exits, send, listenerCount: (signal: string) => listeners.get(signal)?.length ?? 0 }
}

test("the process exits only after every worker has wound down", async () => {
  const { host, exits, send, listenerCount } = fakeHost()
  const { onShutdown } = createShutdown(host)
  let releaseSlow!: () => void
  const finished: string[] = []
  onShutdown("quick", async () => {
    finished.push("quick")
  })
  onShutdown("slow", async () => {
    await new Promise<void>((resolve) => (releaseSlow = resolve))
    finished.push("slow")
  })
  expect(listenerCount("SIGTERM")).toBe(1)

  send("SIGTERM")
  await Bun.sleep(0)
  expect(finished).toEqual(["quick"])
  expect(exits).toEqual([])

  releaseSlow()
  await Bun.sleep(0)
  expect(finished).toEqual(["quick", "slow"])
  expect(exits).toEqual([0])
})

test("a worker that fails while winding down does not keep the process up", async () => {
  const { host, exits, send } = fakeHost()
  const { onShutdown } = createShutdown(host)
  onShutdown("broken", async () => {
    throw new Error("release failed")
  })
  send("SIGTERM")
  await Bun.sleep(0)
  expect(exits).toEqual([0])
})

test("a second signal exits at once", async () => {
  const { host, exits, send } = fakeHost()
  const { onShutdown } = createShutdown(host)
  onShutdown("stuck", () => new Promise<void>(() => {}))
  send("SIGINT")
  await Bun.sleep(0)
  expect(exits).toEqual([])
  send("SIGINT")
  expect(exits).toEqual([0])
})
