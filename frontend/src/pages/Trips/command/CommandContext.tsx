import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { getInitialTheme, type Theme } from "../../Korea/koreaUtils"
import { builtInCommands } from "./builtins"
import { CommandPalette } from "./CommandPalette"
import type { Command } from "./commands"
import { isApplePlatform } from "./keys"
import { commandsSignature, createCommandRegistry, type CommandRegistry } from "./registry"
import { ShortcutsDialog } from "./ShortcutsDialog"
import { chooseTheme, followSystemTheme } from "./theme"

// The palette's home: a registry screens add their commands to, the two
// overlays (palette, shortcuts sheet), and the keys that open them from
// anywhere under it. Mount once around the Trips layout.

export interface CommandPaletteControls {
  /** The palette is showing. */
  open: boolean
  setOpen: (open: boolean) => void
  /** Show the keyboard shortcuts sheet (closing the palette if it is open). */
  openShortcuts: () => void
}

const RegistryContext = createContext<CommandRegistry | null>(null)
const ControlsContext = createContext<CommandPaletteControls | null>(null)
const NO_PALETTE: CommandPaletteControls = { open: false, setOpen: () => {}, openShortcuts: () => {} }

/** One overlay at a time. */
type Overlay = null | "palette" | "shortcuts"

/** Single-key shortcuts must not fire while someone types or works inside a menu or dialog. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    target.isContentEditable ||
    Boolean(target.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'))
  )
}

const anyDialogOpen = () => document.querySelector('[role="dialog"], [role="alertdialog"]') !== null

function focusedElement(): HTMLElement | null {
  const el = document.activeElement
  return el instanceof HTMLElement && el !== document.body ? el : null
}

export function CommandProvider({ children }: { children: ReactNode }) {
  const [registry] = useState(createCommandRegistry)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [apple] = useState(() => isApplePlatform())
  /** The overlay as of the last transition, for handlers that outlive a render. */
  const overlayRef = useRef<Overlay>(null)
  /** Where focus was before the first overlay opened. */
  const returnFocus = useRef<HTMLElement | null>(null)
  /** Chosen in the palette, run once it has closed and focus is back. */
  const pending = useRef<Command | null>(null)

  // Every change of overlay goes through here.
  const moveTo = useCallback((next: Overlay) => {
    if (overlayRef.current === null && next !== null) returnFocus.current = focusedElement()
    // The theme may have changed through the header toggle since last time.
    if (next === "palette") setTheme(getInitialTheme())
    overlayRef.current = next
    setOverlay(next)
  }, [])

  const setOpen = useCallback(
    (open: boolean) => {
      if (open) moveTo("palette")
      else if (overlayRef.current === "palette") moveTo(null)
    },
    [moveTo],
  )
  const openShortcuts = useCallback(() => moveTo("shortcuts"), [moveTo])
  const closeShortcuts = useCallback(() => {
    if (overlayRef.current === "shortcuts") moveTo(null)
  }, [moveTo])

  /** Put focus back, unless another overlay has opened meanwhile (or React is replaying effects). */
  const restoreFocus = useCallback(() => {
    if (overlayRef.current !== null) return
    const el = returnFocus.current
    returnFocus.current = null
    if (el?.isConnected) el.focus({ preventScroll: true })
  }, [])

  const choose = useCallback(
    (command: Command) => {
      pending.current = command
      moveTo(null)
    },
    [moveTo],
  )
  // Close, restore focus, then run: a command that opens a dialog or
  // navigates then starts from where the traveller was, not from the palette.
  const onPaletteClosed = useCallback(() => {
    restoreFocus()
    const command = pending.current
    pending.current = null
    if (command) (registry.find(command.id) ?? command).run()
  }, [registry, restoreFocus])

  // ⌘K / Ctrl+K anywhere, even in a field. `?` when nothing else wants the key.
  // Capture phase, so a field that stops its keys cannot swallow ⌘K.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault()
        if (event.repeat) return
        if (overlayRef.current === "palette") moveTo(null)
        else moveTo("palette")
        return
      }
      if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey) return
      if (overlayRef.current !== null || typing(event.target) || anyDialogOpen()) return
      event.preventDefault()
      moveTo("shortcuts")
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [moveTo])

  useEffect(() => followSystemTheme(), [])

  const registered = useSyncExternalStore(registry.subscribe, registry.snapshot, registry.snapshot)
  const atIndex = /^\/trips\/?$/.test(pathname)
  const pickTheme = useCallback((next: Theme) => {
    chooseTheme(next)
    setTheme(next)
  }, [])
  // A stable stand-in: the built-ins are built during render, and openShortcuts
  // reads overlay refs when it runs (never during render).
  const showShortcuts = useLatestCallback(openShortcuts)
  const commands = useMemo(() => {
    const builtIns = builtInCommands({ navigate, showShortcuts, theme, setTheme: pickTheme, atIndex })
    const taken = new Set(registered.map((command) => command.id))
    return [...registered, ...builtIns.filter((command) => !taken.has(command.id))]
  }, [registered, navigate, showShortcuts, theme, pickTheme, atIndex])

  const controls = useMemo<CommandPaletteControls>(
    () => ({ open: overlay === "palette", setOpen, openShortcuts }),
    [overlay, setOpen, openShortcuts],
  )

  return (
    <RegistryContext.Provider value={registry}>
      <ControlsContext.Provider value={controls}>
        {children}
        <CommandPalette
          open={overlay === "palette"}
          onOpenChange={setOpen}
          commands={commands}
          apple={apple}
          onChoose={choose}
          onClosed={onPaletteClosed}
        />
        <ShortcutsDialog open={overlay === "shortcuts"} onClose={closeShortcuts} onClosed={restoreFocus} apple={apple} />
      </ControlsContext.Provider>
    </RegistryContext.Provider>
  )
}

/**
 * Offer `commands` in the palette while the calling component is mounted.
 * `source` names the set ("trip", "trips"); a later set under the same name
 * replaces it. Pass a fresh array each render if that is easiest: the
 * palette re-renders only when a title, subtitle, group, shortcut, keyword or
 * disabled flag changes, and always runs the newest `run`. A no-op outside a
 * CommandProvider.
 */
export function useRegisterCommands(source: string, commands: readonly Command[]): void {
  const registry = useContext(RegistryContext)
  const latest = useRef(commands)
  const signature = commandsSignature(commands)
  useLayoutEffect(() => {
    latest.current = commands
  })
  useLayoutEffect(() => registry?.register(source, latest), [registry, source])
  useLayoutEffect(() => {
    registry?.changed()
  }, [registry, signature])
}

/** Open or close the palette, or show the shortcuts sheet. Inert outside a CommandProvider. */
export function useCommandPalette(): CommandPaletteControls {
  return useContext(ControlsContext) ?? NO_PALETTE
}
