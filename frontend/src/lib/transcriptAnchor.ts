/** Pin a concierge transcript to the latest user turn instead of chasing
 *  the assistant stream. */

export function lastMessageIdByRole(
  messages: readonly { id: string; role: string }[],
  role: string,
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === role) return messages[i]!.id
  }
}

export function scrollTopForAnchor(
  containerScrollTop: number,
  containerTop: number,
  anchorTop: number,
): number {
  return Math.max(0, containerScrollTop + (anchorTop - containerTop))
}

export function turnSpacerHeight(viewportHeight: number, usedHeight: number): number {
  return Math.max(0, viewportHeight - usedHeight)
}

export function measureContentBelowAnchor(
  container: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "getBoundingClientRect">,
  anchor: Pick<HTMLElement, "getBoundingClientRect">,
  spacerHeight: number,
): number {
  const containerRect = container.getBoundingClientRect()
  const anchorRect = anchor.getBoundingClientRect()
  const anchorBottom = container.scrollTop + (anchorRect.bottom - containerRect.top)
  return Math.max(0, container.scrollHeight - spacerHeight - anchorBottom)
}

export function applyTurnSpacer(
  container: HTMLElement,
  anchor: HTMLElement,
  spacer: HTMLElement,
): number {
  const below = measureContentBelowAnchor(container, anchor, spacer.offsetHeight)
  const height = turnSpacerHeight(container.clientHeight, anchor.offsetHeight + below)
  spacer.style.height = `${height}px`
  return height
}

export function scrollAnchorToTop(container: HTMLElement, anchor: HTMLElement): number {
  const top = scrollTopForAnchor(
    container.scrollTop,
    container.getBoundingClientRect().top,
    anchor.getBoundingClientRect().top,
  )
  container.scrollTo({ top })
  return top
}
