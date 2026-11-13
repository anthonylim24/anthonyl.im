import {
  useEffect,
  useId,
  useRef,
  useState,
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

  return (
    <div ref={wrapRef} {...sx(a.menuWrap)} onKeyDown={onKeyDown}>
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
        <div id={menuId} role="menu" aria-label={label} {...sx(a.menu, align === "start" && a.menuLeft, side === "up" && a.menuUp)}>
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
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <div className="trips trips-portal" data-trip-accent={accent}>
          <DialogPrimitive.Overlay {...sx(a.scrim)} />
          <DialogPrimitive.Content
            {...sx(a.dialog, wide && a.dialogWide)}
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
            {footer && <div {...sx(a.dialogFoot)}>{footer}</div>}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
