import { useSyncExternalStore } from "react"

// The Trips look: the atlas (paper, ink, serif) or Liquid Glass (translucent
// material that bends what is behind it). Independent of light / dark, which
// stays the theme toggle's. The choice is kept on the device and written to
// `<html data-trips-look="glass">`, so portalled dialogs pick it up too.

export type Look = "atlas" | "glass"

const KEY = "trips-look"
/** Fired on `window` with the new `Look` as `detail` after it changes here. */
export const LOOK_EVENT = "trips:look"

export function readLook(): Look {
  try {
    return window.localStorage.getItem(KEY) === "glass" ? "glass" : "atlas"
  } catch {
    return "atlas"
  }
}

export function applyLook(look: Look): void {
  if (typeof document === "undefined") return
  const root = document.documentElement
  if (look === "glass") root.dataset.tripsLook = "glass"
  else delete root.dataset.tripsLook
}

/** Leaving Trips: the rest of the site never wears the look. */
export function clearLook(): void {
  if (typeof document === "undefined") return
  delete document.documentElement.dataset.tripsLook
}

export function chooseLook(look: Look): void {
  try {
    window.localStorage.setItem(KEY, look)
  } catch {
    // Private mode or full storage: the look still changes for this visit.
  }
  applyLook(look)
  window.dispatchEvent(new CustomEvent<Look>(LOOK_EVENT, { detail: look }))
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return
    applyLook(readLook())
    onChange()
  }
  window.addEventListener(LOOK_EVENT, onChange)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(LOOK_EVENT, onChange)
    window.removeEventListener("storage", onStorage)
  }
}

/** The look in use, following changes from the toggle, the palette and other tabs. */
export function useLook(): Look {
  return useSyncExternalStore(subscribe, readLook, () => "atlas")
}
