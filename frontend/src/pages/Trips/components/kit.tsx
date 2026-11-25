import {
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import type { TripAccent } from "../types"
import { placeMenu } from "./menuPlacement"
import { ExitSignal, useClosing, useLeaving } from "./presence"

// Small shared pieces: a popover menu and a modal that becomes a bottom
// sheet on phones. Both portal to <body>, so neither is clipped by a pane,
// and re-declare the `.trips` token scope there.

/** An engraving from `pages/Trips/art/`, inked in the theme's own ink so it reads on either paper. */
export function Engraving({ src }: { src: string }) {
  return <span aria-hidden="true" {...sx(a.engraving)} style={{ maskImage: `url(${src})` }} />
}

export function Spinner() {
  return <span {...sx(a.spinner)} aria-hidden />
}

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  /** Draws a rule above this item. */
  separated?: boolean
}

export function Menu({
  label,
  trigger,
  items,
  align = "end",
  side = "down",
  triggerStyle,
}: {
  label: string
  trigger: ReactNode
  items: MenuItem[]
  align?: "start" | "end"
  side?: "down" | "up"
  triggerStyle?: Parameters<typeof sx>[0]
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const leave = useLeaving(open, menuRef)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  /** The button and the menu: the menu is portalled, so it is not inside the wrapper. */
  const inside = (node: Node | null) => Boolean(node && (wrapRef.current?.contains(node) || menuRef.current?.contains(node)))

  useEffect(() => {
    if (!open) return
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')
    first?.focus({ preventScroll: true })
    const onPointer = (event: PointerEvent) => {
      if (!inside(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    return () => document.removeEventListener("pointerdown", onPointer)
  }, [open])

  // The menu floats over the page, so no pane that clips its overflow can cut
  // it off. Placed before it paints, and again whenever the page under it
  // scrolls or resizes. Written to the node: nothing in React depends on it.
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const menu = menuRef.current
      const button = buttonRef.current
      if (!menu || !button) return
      const at = placeMenu({
        trigger: button.getBoundingClientRect(),
        size: { width: menu.offsetWidth, height: menu.scrollHeight },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        align,
        side,
      })
      menu.style.top = `${at.top}px`
      menu.style.left = `${at.left}px`
      menu.style.maxHeight = at.maxHeight === null ? "" : `${at.maxHeight}px`
      menu.style.transformOrigin = at.transformOrigin
    }
    place()
    window.addEventListener("scroll", place, { capture: true, passive: true })
    window.addEventListener("resize", place)
    return () => {
      window.removeEventListener("scroll", place, { capture: true })
      window.removeEventListener("resize", place)
    }
  }, [open, align, side, menuRef])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!open) return
    if (event.key === "Escape") {
      event.stopPropagation()
      setOpen(false)
      buttonRef.current?.focus()
      return
    }
    // Tab leaves the menu from its button, so focus moves on in page order
    // rather than from wherever the portal sits in the document.
    if (event.key === "Tab") {
      setOpen(false)
      buttonRef.current?.focus()
      return
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return
    event.preventDefault()
    const nodes = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])]
    if (nodes.length === 0) return
    const at = nodes.indexOf(document.activeElement as HTMLElement)
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? nodes.length - 1
          : (at + (event.key === "ArrowDown" ? 1 : -1) + nodes.length) % nodes.length
    nodes[next]?.focus()
  }

  // Tab (or a click on something focusable) taking focus outside closes the
  // menu. A blur with no target is left to the pointerdown handler: Safari
  // blurs to nothing when a menu item is pressed, before its click lands.
  const onFocusOut = (event: ReactFocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget
    if (open && next instanceof Node && !inside(next)) setOpen(false)
  }

  const menu = (
    <div
      id={menuId}
      role="menu"
      aria-label={label}
      // `trips-pop`: the closing animation in index.css.
      {...sx(a.menu, "trips-glass-sheet", "trips-pop")}
      // Fixed, at the spot `placeMenu` finds; scrolls if taller than the room.
      style={FLOATING}
      ref={menuRef}
      {...leave.bind}
    >
      {items.map((item) => (
        <div key={item.label} role="none">
          {item.separated && <div {...sx(a.menuRule)} role="separator" />}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            {...sx(a.menuItem, item.danger && a.menuItemDanger)}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setOpen(false)
              buttonRef.current?.focus()
              item.onSelect()
            }}
          >
            {item.icon}
            {item.label}
          </button>
        </div>
      ))}
    </div>
  )

  return (
    <div ref={wrapRef} {...sx(a.menuWrap)} onKeyDown={onKeyDown} onBlur={onFocusOut}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setOpen((v) => !v)
        }}
        {...sx(triggerStyle ?? a.iconBtn)}
      >
        {trigger}
      </button>
      {/* On <body>, inside a wrapper that re-declares the `.trips` tokens.
          React still bubbles the menu's key and focus events to the wrapper above. */}
      {leave.present && createPortal(<div className="trips trips-portal">{menu}</div>, document.body)}
    </div>
  )
}

/** Over the sticky header and the map; under a dialog's scrim (80) only if one opens on top. */
const FLOATING = { position: "fixed", right: "auto", bottom: "auto", zIndex: 90, maxWidth: "calc(100vw - 16px)", overflowY: "auto" } as const

/**
 * The element that had focus when `open` turned true: the button or menu
 * that opened the dialog. Read in a layout effect, before the dialog mounts
 * (Radix portals in a later commit) and moves focus inside itself.
 */
function useOpener(open: boolean) {
  const opener = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (!open) return
    const active = document.activeElement
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null
  }, [open])
  return opener
}

/**
 * A closing dialog keeps showing what it showed while open: the state that
 * closed it ("which trip to delete", the day's stops) is often cleared in the
 * same click, and the exit animation must not flash the emptied version.
 */
const Frozen = memo(
  function Frozen({ children }: { open: boolean; children: ReactNode }) {
    return <>{children}</>
  },
  (_, next) => !next.open,
)

export function Modal({
  open,
  onClose,
  title,
  description,
  accent,
  wide,
  footer,
  returnFocus,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  accent?: TripAccent
  wide?: boolean
  footer?: ReactNode
  /** Where focus goes on close when what opened the dialog has gone (see `DialogFrame`). */
  returnFocus?: () => HTMLElement | null | undefined
  children: ReactNode
}) {
  const [scrolled, setScrolled] = useState(false)
  return (
    <DialogFrame open={open} onClose={onClose} accent={accent} returnFocus={returnFocus} content={[a.dialog, wide && a.dialogWide, "trips-glass-sheet"]}>
      <div {...sx(a.dialogHead, scrolled && a.dialogHeadRuled)}>
        <div {...sx(a.stack)}>
          <DialogPrimitive.Title {...sx(a.dialogTitle, a.wrap)}>{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description {...sx(a.body)}>{description}</DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description {...sx(a.srOnly)}>{title}</DialogPrimitive.Description>
          )}
        </div>
        <DialogPrimitive.Close {...sx(a.iconBtn, a.iconBtnSm)} aria-label="Close">
          <X size={18} strokeWidth={1.75} aria-hidden />
        </DialogPrimitive.Close>
      </div>
      <div {...sx(a.dialogBody)} onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 0)}>
        {children}
      </div>
      {footer && <div {...sx(a.dialogFoot, "trips-dialog-foot")}>{footer}</div>}
    </DialogFrame>
  )
}

/**
 * What every Trips dialog stands on: Radix's dialog in a plain portal that
 * re-declares the `.trips` tokens, a scrim, and a Content that animates out
 * (`trips-scrim` / `trips-dialog` in index.css), is inert while it does, and
 * keeps showing what it showed while open. Focus goes back to whatever
 * opened it, or, when that has gone (the dialog deleted it), to
 * `returnFocus()`. Inside a `Presence`, it closes when the caller lets go.
 */
export function DialogFrame({
  open,
  onClose,
  accent,
  content,
  onOpenAutoFocus,
  returnFocus,
  children,
}: {
  open: boolean
  onClose: () => void
  accent?: TripAccent
  /** The Content's styles and classes, as `sx` takes them. */
  content: Parameters<typeof sx>
  onOpenAutoFocus?: (event: Event) => void
  returnFocus?: () => HTMLElement | null | undefined
  children: ReactNode
}) {
  const closing = useClosing()
  const shown = open && !closing
  const opener = useOpener(shown)
  /** Where focus was going when it last left an element in the dialog. */
  const heading = useRef<EventTarget | null>(null)
  return (
    <DialogPrimitive.Root open={shown} onOpenChange={(next) => !next && onClose()}>
      {/* A plain portal, not Radix's: its presence would watch this token
          wrapper, which never animates, and drop the dialog the instant `open`
          turns false. The scrim and the dialog keep their own presence and
          leave when their closing animations end; closed, the wrapper is empty. */}
      {createPortal(
        <div className="trips trips-portal" data-trip-accent={accent}>
          <DialogPrimitive.Overlay {...sx(a.scrim, "trips-scrim")} />
          <DialogPrimitive.Content
            {...sx(...content, "trips-dialog")}
            // While it animates out, nothing in it can be pressed again.
            inert={!shown}
            onOpenAutoFocus={onOpenAutoFocus}
            // A field that removes nodes as focus leaves it (a list closing on
            // blur) does so while focus is on <body>, and Radix then moves focus
            // to the dialog itself. Focus goes on to where it was going.
            onBlurCapture={(event) => {
              heading.current = event.relatedTarget
            }}
            onFocusCapture={(event) => {
              const next = heading.current
              heading.current = null
              if (event.target === event.currentTarget && next instanceof HTMLElement && next !== event.currentTarget && next.isConnected && event.currentTarget.contains(next)) {
                next.focus({ preventScroll: true })
              }
            }}
            onCloseAutoFocus={(event) => {
              // These dialogs have no Radix Trigger, so Radix would send focus
              // to a null trigger: <body>, and a keyboard user starts over.
              const target = opener.current?.isConnected ? opener.current : returnFocus?.()
              if (!target?.isConnected) return
              event.preventDefault()
              target.focus({ preventScroll: true })
            }}
          >
            <ExitSignal />
            <Frozen open={shown}>{children}</Frozen>
          </DialogPrimitive.Content>
        </div>,
        document.body,
      )}
    </DialogPrimitive.Root>
  )
}
