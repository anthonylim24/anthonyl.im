import { useState, type ReactNode } from "react"
import * as stylex from "@stylexjs/stylex"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"
import { sx } from "@/styles/merge"

export interface SelectOption<V extends string = string> {
  value: V
  label: string
  /** Muted text after the label in the list ("UTC+9", "2 nights"). */
  hint?: string
  /** What the closed control shows when the label is too long for it ("USD" for "USD · US dollar"). */
  short?: string
  /** What typing jumps to when it differs from the label ("Tokyo" for "Asia/Tokyo"). */
  textValue?: string
  disabled?: boolean
}

// Radix reserves "" for "nothing chosen", and these selects have real empty
// choices ("No date", "Not set"), so every value travels with a prefix.
const encode = (value: string) => `=${value}`
const decode = (value: string) => value.slice(1)

/**
 * A select in the atlas: the closed control is a field (or a pill), and the
 * open list is a raised sheet like the kit Menu, the same on a phone as on a
 * desktop. Radix places it, scrolls it, handles typeahead and the keyboard,
 * and layers it over the kit dialogs and sheets (the same dismissable-layer
 * and focus-scope instances as `@radix-ui/react-dialog`), which a portalled
 * kit Menu cannot do.
 */
export function Select<V extends string>({
  value,
  options,
  onChange,
  label,
  id,
  disabled,
  size = "md",
  shape = "field",
  icon,
  placeholder,
  trigger,
  triggerStyle,
}: {
  value: V
  options: readonly SelectOption<V>[]
  onChange: (value: V) => void
  /** The accessible name, when no `<label htmlFor={id}>` names it. */
  label?: string
  id?: string
  disabled?: boolean
  /** `sm` looks 36px tall with a 44px target, for a control inside a row. */
  size?: "md" | "sm"
  shape?: "field" | "pill"
  /** A glyph before the value. */
  icon?: ReactNode
  placeholder?: string
  /** Replaces the value and chevron in the closed control (an icon-only picker). */
  trigger?: ReactNode
  triggerStyle?: stylex.StyleXStyles
}) {
  const [open, setOpen] = useState(false)
  const chosen = options.find((option) => option.value === value)
  return (
    <SelectPrimitive.Root
      value={chosen ? encode(value) : ""}
      onValueChange={(next) => onChange(decode(next) as V)}
      open={open}
      onOpenChange={setOpen}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={label}
        {...sx(
          st.trigger,
          size === "sm" && st.triggerSm,
          shape === "pill" && st.triggerPill,
          !disabled && !open && st.triggerHover,
          open && st.triggerOpen,
          trigger !== undefined && st.triggerCustom,
          triggerStyle,
        )}
      >
        {trigger ?? (
          <>
            {icon && <span {...sx(st.icon)}>{icon}</span>}
            <span {...sx(st.value, !chosen && st.placeholder)}>{chosen ? (chosen.short ?? chosen.label) : (placeholder ?? "")}</span>
            <ChevronDown size={16} strokeWidth={1.75} aria-hidden {...sx(st.chevron, open && st.chevronOpen)} />
          </>
        )}
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        {/* On <body>, inside a wrapper that re-declares the `.trips` tokens, as the kit Menu and Modal do. */}
        <div className="trips trips-portal">
          <SelectPrimitive.Content
            position="popper"
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={8}
            {...sx(st.content, "trips-glass-sheet")}
          >
            <SelectPrimitive.ScrollUpButton {...sx(st.scroll)}>
              <ChevronUp size={16} strokeWidth={1.75} aria-hidden />
            </SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport {...sx(st.viewport)}>
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={encode(option.value)}
                  textValue={option.textValue ?? option.label}
                  disabled={option.disabled}
                  {...sx(st.item, option.value === value && st.itemOn, option.disabled && st.itemOff)}
                >
                  <span {...sx(st.label)}>
                    <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  </span>
                  {option.hint && <span {...sx(st.hint)}>{option.hint}</span>}
                  {/* Every row keeps the slot, so hints stay in one column. */}
                  <span {...sx(st.check)}>
                    <SelectPrimitive.ItemIndicator>
                      <Check size={16} strokeWidth={2} aria-hidden />
                    </SelectPrimitive.ItemIndicator>
                  </span>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
            <SelectPrimitive.ScrollDownButton {...sx(st.scroll)}>
              <ChevronDown size={16} strokeWidth={1.75} aria-hidden />
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </div>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

const HOVER = "@media (hover: hover)"
const REDUCE = "@media (prefers-reduced-motion: reduce)"
const WIDE = "@media (min-width: 640px)"

const rise = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(-4px) scale(0.98)" },
  to: { opacity: 1, transform: "none" },
})

const st = stylex.create({
  trigger: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    width: "100%",
    minWidth: 0,
    minHeight: "2.75rem",
    paddingInlineStart: "0.875rem",
    paddingInlineEnd: "0.625rem",
    borderRadius: "var(--trips-field-radius)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--trips-line-strong)",
    backgroundColor: "var(--trips-raised)",
    color: "var(--trips-ink)",
    fontSize: "1rem",
    lineHeight: 1.4,
    textAlign: "left",
    cursor: "pointer",
    outline: "none",
    transitionProperty: "border-color, box-shadow",
    transitionDuration: "140ms",
    ":focus-visible": { borderColor: "var(--brand-fill)", boxShadow: "0 0 0 3px var(--brand-soft)" },
    ":disabled": { opacity: 0.55, cursor: "not-allowed" },
    [WIDE]: { fontSize: "0.9375rem" },
    [REDUCE]: { transitionDuration: "0ms" },
  },
  triggerHover: { [HOVER]: { ":hover": { borderColor: "var(--trips-ink-tertiary)" } } },
  triggerOpen: { borderColor: "var(--brand-fill)", boxShadow: "0 0 0 3px var(--brand-soft)" },
  // Looks 36px tall; the ::after band keeps the target at 44px.
  triggerSm: {
    minHeight: "2.25rem",
    paddingInlineStart: "0.625rem",
    paddingInlineEnd: "0.5rem",
    gap: "0.375rem",
    borderRadius: "var(--trips-radius-sm)",
    fontSize: "0.8125rem",
    position: "relative",
    "::after": { content: '""', position: "absolute", inset: "-4px 0" },
    [WIDE]: { fontSize: "0.8125rem" },
  },
  triggerPill: { borderRadius: "999px", paddingInlineStart: "1rem", paddingInlineEnd: "0.75rem" },
  triggerCustom: { width: "auto", paddingInline: 0, justifyContent: "center" },
  icon: { display: "grid", flexShrink: 0, color: "var(--trips-ink-tertiary)" },
  value: { flexGrow: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  placeholder: { color: "var(--trips-ink-faint)" },
  chevron: {
    flexShrink: 0,
    color: "var(--trips-ink-tertiary)",
    transitionProperty: "transform",
    transitionDuration: "180ms",
    transitionTimingFunction: "var(--trips-ease-out)",
    [REDUCE]: { transitionDuration: "0ms" },
  },
  chevronOpen: { transform: "rotate(180deg)" },

  content: {
    zIndex: 90,
    minWidth: "max(var(--radix-select-trigger-width), 11rem)",
    maxWidth: "min(24rem, calc(100vw - 16px))",
    maxHeight: "min(var(--radix-select-content-available-height), 22rem)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    borderRadius: "var(--trips-radius)",
    backgroundColor: "var(--trips-raised)",
    boxShadow: "var(--trips-shadow-3)",
    color: "var(--trips-ink)",
    transformOrigin: "var(--radix-select-content-transform-origin)",
    animationName: rise,
    animationDuration: "160ms",
    animationTimingFunction: "var(--trips-ease-out)",
    [REDUCE]: { animationName: "none" },
  },
  viewport: { padding: "0.375rem" },
  // 0.375rem of sheet plus 0.5rem of row: the label starts where the
  // trigger's text does (0.875rem in), so the list reads as the field opened.
  item: {
    display: "flex",
    alignItems: "center",
    gap: "0.625rem",
    minHeight: "2.75rem",
    paddingInlineStart: "0.5rem",
    paddingInlineEnd: "0.5rem",
    borderRadius: "0.5rem",
    fontSize: "1rem",
    lineHeight: 1.3,
    color: "var(--trips-ink)",
    cursor: "pointer",
    userSelect: "none",
    outline: "none",
    overflowWrap: "anywhere",
    ":focus": { backgroundColor: "var(--trips-sunken)" },
    ":focus-visible": { boxShadow: "inset 0 0 0 2px var(--brand-ring)" },
    [WIDE]: { fontSize: "0.9375rem" },
  },
  itemOn: { fontWeight: 600 },
  itemOff: { opacity: 0.45, cursor: "not-allowed" },
  label: { flexGrow: 1, minWidth: 0 },
  hint: {
    flexShrink: 0,
    fontFamily: "var(--trips-mono)",
    fontSize: "0.75rem",
    letterSpacing: "0.02em",
    fontVariantNumeric: "tabular-nums",
    color: "var(--trips-ink-tertiary)",
  },
  check: { display: "grid", placeItems: "center", flexShrink: 0, width: "1rem", color: "var(--brand)" },
  scroll: { display: "grid", placeItems: "center", height: "1.75rem", color: "var(--trips-ink-tertiary)", cursor: "default" },
})

