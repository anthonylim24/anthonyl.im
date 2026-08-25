# StyleX agent memory

Pointer: full methodology lives at [`.agents/skills/stylex/SKILL.md`](../skills/stylex/SKILL.md) (symlinked from `.claude/skills/stylex/SKILL.md`).

Short rules also live under **Frontend StyleX** in [`AGENTS.md`](../../AGENTS.md) and [`CLAUDE.md`](../../CLAUDE.md).

Read the skill before editing UI styling. Effect I/O rules still win for `/api` work — use [`effect-ts`](./effect-ts.md) for network code.

Hard rules:

1. Tailwind is removed — StyleX + `index.css` semantic classes only.
2. Always `sx(...)` — merge StyleX styles with semantic class strings from `index.css` when the old Tailwind bundle included them (`cover-band`, `cover-dock`, `group`, animations).
3. Preflight lives in `@layer reset`; set `borderWidth` + `borderStyle` with `borderColor`.
4. Unlayered CSS beats layered StyleX — use explicit utility classes when opacity/visibility fights layers.
5. **Trips local testing:** matching `VITE_DEV_BEARER` + `IG_DEV_BEARER`; run Playwright `trips skips the Clerk sign-in wall under VITE_DEV_BEARER`. Previews use `clerk-agent-login.ts`, not dev bearer.
