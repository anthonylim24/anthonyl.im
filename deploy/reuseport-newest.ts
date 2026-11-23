// Sends every new connection on a SO_REUSEPORT port to the newest listener.
//
//   bun deploy/reuseport-newest.ts PID FD
//
// Attaches a one-instruction classic BPF program, "take socket 1", to the
// reuseport group of socket FD in process PID (copied with pidfd_getfd, so
// root, or the process itself). The kernel numbers a group's sockets in the
// order they joined and moves the last one into a leaver's slot, so socket 1
// is the newer of two; with one socket the index is out of range and the
// kernel falls back to that one. The program belongs to the group and stays
// while any socket is in it.
//
// deploy/restart.sh runs this before it starts its bridge. Without it the
// kernel spreads connections over both listeners, and Bun resets one it has
// accepted but not yet read when it stops listening. With it, each listener
// stops getting connections as soon as the next one joins, so nothing is in
// that state when it closes. Linux only; server/src/reusePort.test.ts runs it.
import { dlopen, FFIType, ptr, read } from 'bun:ffi'

const SOL_SOCKET = 1
const SO_ATTACH_REUSEPORT_CBPF = 51
const BPF_RET_K = 0x06

export function steerToNewest(pid: number, fd: number) {
  const libc = dlopen('libc.so.6', {
    pidfd_open: { args: [FFIType.i32, FFIType.u32], returns: FFIType.i32 },
    pidfd_getfd: { args: [FFIType.i32, FFIType.i32, FFIType.u32], returns: FFIType.i32 },
    setsockopt: { args: [FFIType.i32, FFIType.i32, FFIType.i32, FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
    close: { args: [FFIType.i32], returns: FFIType.i32 },
    __errno_location: { args: [], returns: FFIType.ptr },
  })
  const c = libc.symbols
  const check = (name: string, rc: number) => {
    if (rc < 0) throw new Error(`${name} failed: errno ${read.i32(c.__errno_location()!, 0)}`)
    return rc
  }
  // struct sock_filter { u16 code; u8 jt; u8 jf; u32 k }: return 1.
  const filter = new DataView(new ArrayBuffer(8))
  filter.setUint16(0, BPF_RET_K, true)
  filter.setUint32(4, 1, true)
  // struct sock_fprog { u16 len; struct sock_filter *filter } (pointer at 8).
  const fprog = new DataView(new ArrayBuffer(16))
  fprog.setUint16(0, 1, true)
  fprog.setBigUint64(8, BigInt(ptr(filter)), true)
  try {
    const pidfd = check('pidfd_open', c.pidfd_open(pid, 0))
    try {
      const sock = check('pidfd_getfd', c.pidfd_getfd(pidfd, fd, 0))
      try {
        check('setsockopt', c.setsockopt(sock, SOL_SOCKET, SO_ATTACH_REUSEPORT_CBPF, ptr(fprog), 16))
      } finally {
        // The copy holds the listener open; never keep it past this call.
        c.close(sock)
      }
    } finally {
      c.close(pidfd)
    }
  } finally {
    libc.close()
  }
}

if (import.meta.main) {
  const [pid, fd] = process.argv.slice(2).map(Number)
  if (!(pid > 0 && fd >= 0)) {
    console.error('usage: bun deploy/reuseport-newest.ts PID FD')
    process.exit(2)
  }
  try {
    steerToNewest(pid, fd)
    console.log(`[restart] new connections go to the newest listener (pid ${pid} fd ${fd})`)
  } catch (err) {
    console.error(`[restart] ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }
}
