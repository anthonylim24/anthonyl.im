/** A stop's control in the day under `root`: its row in the list, else its edit button on the timeline. */
export function stopRow(root: ParentNode | null, id: string): HTMLElement | null {
  const card = root?.querySelector(`#${CSS.escape(`item-${id}`)}`)
  return (
    card?.querySelector<HTMLElement>("[data-card-row]") ??
    Array.from(root?.querySelectorAll<HTMLElement>("[data-timeline-edit]") ?? []).find((el) => el.dataset.timelineEdit === id) ??
    null
  )
}
