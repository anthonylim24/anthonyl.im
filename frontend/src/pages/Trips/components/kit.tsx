import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import type { TripAccent } from "../types"

// Small shared pieces: a popover menu and a modal that becomes a bottom
// sheet on phones. Both portal-safe: the modal re-declares the `.trips`
// token scope because Radix portals to <body>.

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
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const first = wrapRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')
    first?.focus()
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    return () => document.removeEventListener("pointerdown", onPointer)
  }, [open])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!open) return
    if (event.key === "Escape") {
      event.stopPropagation()
      setOpen(false)
      buttonRef.current?.focus()
      return
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return
    event.preventDefault()
    const nodes = [...(wrapRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])]
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
    if (open && next instanceof Node && !wrapRef.current?.contains(next)) setOpen(false)
  }

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
      {open && (
        <div id={menuId} role="menu" aria-label={label} {...sx(a.menu, align === "start" && a.menuLeft, side === "up" && a.menuUp, "trips-glass-sheet")}>
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
      )}
    </div>
  )
}

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

export function Modal({
  open,
  onClose,
  title,
  description,
  accent,
  wide,
  footer,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  accent?: TripAccent
  wide?: boolean
  footer?: ReactNode
  children: ReactNode
}) {
  const opener = useOpener(open)
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <div className="trips trips-portal" data-trip-accent={accent}>
          {/* `trips-scrim` / `trips-dialog`: the closing animations in index.css. */}
          <DialogPrimitive.Overlay {...sx(a.scrim, "trips-scrim")} />
          <DialogPrimitive.Content
            {...sx(a.dialog, wide && a.dialogWide, "trips-dialog", "trips-glass-sheet")}
            onCloseAutoFocus={(event) => {
              // These dialogs have no Radix Trigger, so Radix would send focus
              // to a null trigger: <body>, and a keyboard user starts over.
              const target = opener.current
              if (!target?.isConnected) return
              event.preventDefault()
              target.focus({ preventScroll: true })
            }}
          >
            <div {...sx(a.dialogHead)}>
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
            <div {...sx(a.dialogBody)}>{children}</div>
            {footer && <div {...sx(a.dialogFoot, "trips-dialog-foot")}>{footer}</div>}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
