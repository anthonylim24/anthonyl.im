# Chat (site root) — interface design commitments

> The design authority for `/` and `/chatbot` is the vendored Taste Skills V2
> pair (`.claude/skills/design-taste-frontend/SKILL.md` and
> `.claude/skills/redesign-existing-projects/SKILL.md`). This file records the
> decisions that skill produced, so the next agent does not have to re-derive
> them. Where this file and the older prose in `CLAUDE.md` / `PRODUCT.md`
> disagree about the root app, this file wins.

## Design read

> A developer's personal site whose product IS the live assistant, for
> recruiters and engineers who scan in under 30 seconds, with a quiet
> technical-editorial language, leaning toward Tailwind v4, self-hosted Geist,
> one electric-blue accent, and CSS-only motion.

Dials: `DESIGN_VARIANCE 8`, `MOTION_INTENSITY 5`, `VISUAL_DENSITY 3`.

## Shape of the page

A single viewport, never a scrolling marketing page: the conversation is the
product, so the page is `min-h-[100dvh]` with the transcript as the only
scrollport.

- `lg` and up: two columns inside `max-w-[1400px]`. The identity rail
  (`minmax(18rem, 26rem)`) carries the hero; the conversation takes the rest.
- Once a transcript exists the rail condenses through a grid-template
  transition, handing the room to the answer. The name and positioning stay
  visible and the contact links move to the composer footer, so nothing becomes
  unreachable.
- Below `lg` the rail becomes a compact header; below `768px` the composer is
  bottom-anchored with `pb-safe` and the suggestions scroll-snap.

Hero stack discipline (skill 4.7): four text elements, no more. The employer
mark strip, the name, the positioning plus subtext, and the contact links. The
AI disclaimer belongs to the composer, not the hero.

## Tokens

Declared in the `.chat` block of `frontend/src/index.css`; the theme is a class
on the shell (`chat-light` / `chat-dark`), so components carry no `dark:`
variants.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--ch-canvas` | `#f3f3f4` | `#0c0c0d` | Page |
| `--ch-surface` | `#fcfcfd` | `#151517` | Message and panel surfaces |
| `--ch-ink` | `#18181b` | `#e7e7e9` | Body |
| `--ch-ink-muted` | `#52525b` | `#a1a1aa` | Secondary copy (AA floor) |
| `--ch-accent` | `#1d4ed8` | `#93b4ff` | The one accent |
| `--ch-danger` | `#b42318` | `#ff9d95` | Inline errors |

Radius: message and panel surfaces `--ch-r-panel` (12px), controls
`--ch-r-control` (8px), `rounded-full` only for the scroll-to-latest control.

Type: Geist Variable body, `.chat-display` for the name, `.chat-mono` for
labels and counts. No 10px primary UI text; body is at least 14px.

## The visual layer

The page's real image is moving footage of leaf shadow (`/leaves.mp4`, 341 KB,
served from our own origin rather than the Cloudflare worker it used to come
from). It is a fixed, `pointer-events-none` layer under the content, multiplied
over the light canvas and screened over the dark one, so neither theme is flat.
It is a labelled `Ambience` control, not a cryptic keyboard-only toggle, and it
pauses under `prefers-reduced-motion`.

Employer marks (`/logos/doordash.svg`, `/logos/ebay.svg`) are the real Simple
Icons glyphs, logos only, with no category labels underneath (skill 4.8).

## Copy deck

Everything visible is grounded in the profile that `server/src/routes/constants.ts`
gives the model. Nothing on this page may claim anything that file does not.

- `Anthony Lim`
- `Software engineer at DoorDash, based in San Francisco.`
- `Ask this assistant about his work, the teams he has shipped with, or how to reach him.`
- Suggestions: `What does Anthony build at DoorDash?`, `Which stacks does he work in?`,
  `Where has he worked before?`, `How do I reach him?`
- Composer placeholder: `Ask about Anthony's work`
- Disclaimer: `Answers come from a model briefed on Anthony's background. Verify anything important.`

## Rules a future change must not break

1. Motion on this route is CSS only. Importing `motion/react` here drags the
   motion chunk into the LCP bundle.
2. Theme follows `prefers-color-scheme` first, then the user's stored override.
3. The transcript is a live region (`role="log"`, `aria-live="polite"`), and a
   failed answer is an inline error with a retry, never a fabricated apology
   from the assistant.
4. Zero em dashes and en dashes in any string on this page.
5. Every control: 44x44 minimum, visible focus ring, `:active` feedback,
   accessible name.
