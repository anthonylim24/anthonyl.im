// A polite live region that outlives the overlay that speaks through it.
// The wishlist overlay closes in the same click that schedules or removes a
// place, and a region inside it would be gone before a screen reader read
// it. This one sits on <body>, is created when an overlay opens (a region
// must exist before its text changes to be heard), and is never removed.

const ATTR = "data-trips-announcer"

function region(): HTMLElement | null {
  if (typeof document === "undefined") return null
  const found = document.querySelector<HTMLElement>(`[${ATTR}]`)
  if (found) return found
  const node = document.createElement("p")
  node.setAttribute(ATTR, "")
  node.setAttribute("role", "status")
  node.setAttribute("aria-live", "polite")
  // Visually hidden, as `a.srOnly`: StyleX cannot reach a node made outside React.
  Object.assign(node.style, {
    position: "absolute",
    width: "1px",
    height: "1px",
    margin: "-1px",
    padding: "0",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    border: "0",
  })
  document.body.append(node)
  return node
}

/** Make sure the region is on the page, ahead of anything it will say. */
export const prepareAnnouncer = () => void region()

/** Say `text` politely. The same words twice in a row are still read the second time. */
export function announce(text: string) {
  const node = region()
  if (!node) return
  node.textContent = node.textContent === text ? text + String.fromCharCode(160) : text
}
