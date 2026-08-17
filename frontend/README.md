# frontend

React 19 + Vite 8 SPA for [anthonyl.im](https://anthonyl.im).

- BreathFlow lives in `src/breathflow/`
- Korea + Trips live in `src/pages/`
- Effect I/O lives in `src/effect/`

## Commands

```bash
bun run dev         # Vite; proxies /api → localhost:3000
bun run typecheck
bun run test:run
bun run build
```

The Vite dev server proxies `/api` to `http://localhost:3000`. Start the Hono server separately when you need live API responses.

Full docs: [`../CLAUDE.md`](../CLAUDE.md).
