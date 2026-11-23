import { expect, test } from "bun:test"
import { readdirSync, readFileSync, readlinkSync } from "node:fs"
import { steerToNewest } from "../../deploy/reuseport-newest.ts"

// Restarts that drop nothing (deploy/restart.sh, index.ts) rest on two things
// Bun does on Linux: a second server can listen on the same port with
// `reusePort`, and `stop()` closes the listener at once (new connections go
// to the other server) while a request already in flight still gets its
// answer. A Bun upgrade that changes either brings the 502s back.
test.skipIf(process.platform !== "linux")("a stopped server hands the port over and finishes what it has", async () => {
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  const first = Bun.serve({
    port: 0,
    reusePort: true,
    async fetch() {
      await held
      return new Response("first")
    },
  })
  const url = `http://127.0.0.1:${first.port}/`
  const get = () => fetch(url, { headers: { connection: "close" } }).then((res) => res.text())
  try {
    const inFlight = get()
    await Bun.sleep(50)

    const second = Bun.serve({ port: first.port, reusePort: true, fetch: () => new Response("second") })
    try {
      let stopped = false
      const stopping = first.stop().then(() => (stopped = true))

      const answers = await Promise.all(Array.from({ length: 20 }, get))
      expect(new Set(answers)).toEqual(new Set(["second"]))
      expect(stopped).toBe(false)

      release()
      expect(await inFlight).toBe("first")
      await stopping
    } finally {
      await second.stop(true)
    }
  } finally {
    release()
    await first.stop(true)
  }
})

// deploy/restart.sh attaches this to the server's socket before it starts
// the bridge; here the test process steers its own socket, which needs no
// privileges. It runs in CI on x86_64, the droplet's architecture.
test.skipIf(process.platform !== "linux")("steerToNewest sends every new connection to the newest listener", async () => {
  const serve = (tag: string, port = 0) => Bun.serve({ port, reusePort: true, fetch: () => new Response(tag) })
  const answers = (port: number) =>
    Promise.all(
      Array.from({ length: 20 }, () =>
        fetch(`http://127.0.0.1:${port}/`, { headers: { connection: "close" } }).then((res) => res.text()),
      ),
    ).then((tags) => [...new Set(tags)])
  const first = serve("first")
  const port = first.port
  const servers = [first]
  try {
    steerToNewest(process.pid, listeningFd(port))
    servers.push(serve("second", port))
    expect(await answers(port)).toEqual(["second"])
    // The program stays with the port while any listener does.
    await first.stop()
    servers.push(serve("third", port))
    expect(await answers(port)).toEqual(["third"])
  } finally {
    for (const server of servers) await server.stop(true)
  }
})

/** This process's fd for the socket listening on `port` (from /proc). */
function listeningFd(port: number): number {
  const hexPort = `:${port.toString(16).toUpperCase().padStart(4, "0")}`
  const inodes = new Set<string>()
  for (const table of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    for (const line of readFileSync(table, "utf8").split("\n").slice(1)) {
      const fields = line.trim().split(/\s+/)
      // local_address is field 1, state 0A is LISTEN, inode is field 9.
      if (fields[1]?.endsWith(hexPort) && fields[3] === "0A") inodes.add(fields[9]!)
    }
  }
  for (const fd of readdirSync("/proc/self/fd")) {
    let target = ""
    try {
      target = readlinkSync(`/proc/self/fd/${fd}`)
    } catch {
      continue
    }
    const inode = /^socket:\[(\d+)\]$/.exec(target)?.[1]
    if (inode && inodes.has(inode)) return Number(fd)
  }
  throw new Error(`no listening socket on :${port} in this process`)
}
