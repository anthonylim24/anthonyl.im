import type { Sync } from "../editorMachine"

export type Tone = "ok" | "busy" | "waiting" | "error"

export interface SaveWords {
  word: "Saved" | "Saving" | "Offline" | "Not saved"
  detail: string | null
  tone: Tone
  retry: boolean
}

/** What the save line says for this state (exported for tests and other surfaces). */
export function saveWords(sync: Sync, online: boolean): SaveWords {
  switch (sync.k) {
    case "clean":
      return { word: "Saved", detail: null, tone: "ok", retry: false }
    case "conflict":
      return { word: "Not saved", detail: "Choose whose version to keep", tone: "error", retry: false }
    case "saveError":
      if (sync.failure === "refused") return { word: "Not saved", detail: sync.message, tone: "error", retry: false }
      if (!online) return { word: "Offline", detail: "will save when back online", tone: "waiting", retry: false }
      return {
        word: "Not saved",
        detail: sync.failure === "network" ? "Couldn’t reach the server" : "The server had a problem",
        tone: "error",
        retry: true,
      }
    case "dirty":
    case "saving":
      return online
        ? { word: "Saving", detail: null, tone: "busy", retry: false }
        : { word: "Offline", detail: "will save when back online", tone: "waiting", retry: false }
  }
}
