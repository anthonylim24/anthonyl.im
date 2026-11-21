import type { Command } from "./commands"

// The palette's registry: every mounted screen's commands, keyed by source.
// An external store (read with useSyncExternalStore) rather than React state,
// so registering never re-renders the screen that registered.
//
// Each source hands over a ref to its latest commands. `snapshot()` is what
// the palette draws and changes only when a source says its visible commands
// changed; `find()` reads the refs live, so a command's `run` is always the
// newest closure even when nothing visible changed.

export interface CommandSource {
  current: readonly Command[]
}

export interface CommandRegistry {
  /** Add a source; returns its removal. A later registration under the same name replaces it. */
  register: (source: string, commands: CommandSource) => () => void
  /** Tell listeners that a source's visible commands changed. */
  changed: () => void
  subscribe: (listener: () => void) => () => void
  /** Every registered command, in registration order, first of each id. Stable between changes. */
  snapshot: () => readonly Command[]
  /** The newest command with this id. */
  find: (id: string) => Command | undefined
}

export function createCommandRegistry(): CommandRegistry {
  const sources = new Map<string, CommandSource>()
  const listeners = new Set<() => void>()
  let cached: readonly Command[] | null = null

  const collect = (): Command[] => {
    const seen = new Set<string>()
    const out: Command[] = []
    for (const source of sources.values()) {
      for (const command of source.current) {
        if (seen.has(command.id)) continue
        seen.add(command.id)
        out.push(command)
      }
    }
    return out
  }

  const changed = () => {
    cached = null
    for (const listener of listeners) listener()
  }

  return {
    register(name, commands) {
      sources.delete(name)
      sources.set(name, commands)
      changed()
      return () => {
        // A newer registration under the same name is not ours to remove.
        if (sources.get(name) !== commands) return
        sources.delete(name)
        changed()
      }
    },
    changed,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    snapshot() {
      cached ??= collect()
      return cached
    },
    find: (id) => collect().find((command) => command.id === id),
  }
}

/** Everything the palette draws about a list of commands but the icons, as one string. */
export function commandsSignature(commands: readonly Command[]): string {
  return commands
    .map((c) => [c.id, c.title, c.subtitle ?? "", c.group, c.disabled ? "1" : "0", (c.shortcut ?? []).join("+"), (c.keywords ?? []).join(",")].join("\u001f"))
    .join("\u001e")
}
