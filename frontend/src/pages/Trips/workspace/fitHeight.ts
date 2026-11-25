import { useLayoutEffect, type RefObject } from "react"

const fieldSizing = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("field-sizing", "content")

/** Grows a textarea with its text where `field-sizing: content` (a.textarea) is not supported yet. */
export function useFitHeight(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || fieldSizing) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }, [ref, value])
}
