# Claude Code cloud kit

Mirror of `.codex/` for the Claude Code cloud environment. Everything here is
a thin shell on top of `.codex/lib.sh` plus the one thing Codex doesn't
need: Playwright + Chromium so end-to-end tests can run.

## Scripts

| Script | Purpose |
|---|---|
| `setup.sh` | One-shot bootstrap. Runs `.codex/setup.sh` (Bun, Node, deps, env stubs) then installs Playwright Chromium. Idempotent. |
| `verify.sh` | Exec wrapper around `.codex/check.sh` — server tests + frontend typecheck, matching the GitHub Actions deploy gate. Lint and frontend unit tests are intentionally NOT in the gate (pre-existing failures on main); run them separately when fixing that debt. |
| `dev.sh` | Boots Hono :3000 and Vite :5173. Exec wrapper around `.codex/dev.sh`. |
| `e2e.sh` | Runs Playwright against a live full stack. Playwright's `webServer` config owns the lifecycle — no manual server orchestration. |
| `cloud-setup.test.sh` | Invariant lint for the scripts above. |

## Why mirror, not fork

`.codex/lib.sh` is the single source of truth for the registry/install/verify
dance. Both `.codex/*` and `.claude/cloud/*` source it. If you find yourself
copying logic between the two trees, push it down into `lib.sh` instead.

## Configuring the Claude Code cloud environment

Point the environment's:
- **Setup command** → `bash .claude/cloud/setup.sh`
- **Verify/lint command** → `bash .claude/cloud/verify.sh`

E2E (`e2e.sh`) is opt-in — heavyweight, downloads a browser, runs a live
stack. Not part of every loop.
