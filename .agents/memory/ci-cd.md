# CI/CD agent memory

Pointer: full reference lives at [`docs/ci-cd.md`](../../docs/ci-cd.md).

Read that before changing `.github/workflows/*`, `.github/actions/*`, `.github/dependabot.yml`, `.codex/check.sh`, `.depot/workflows/*`, `deploy/ci/*`, `deploy/origin/*`, or deploy behavior.

Origin CI/CD: [`docs/origin-cicd.md`](../../docs/origin-cicd.md). Depot/Buildkite only work on Origin-hosted repos. Inbound GitHub mirrors keep CI on GitHub unless you attach Automations. Never enable `ORIGIN_DEPLOY_ENABLED` while GitHub Actions still deploys.

Hard rules:

1. Text `bun.lock` only (never reintroduce `bun.lockb`).
2. Branch protection requires only the aggregate check named `pr-gate`. That job must start immediately (no `needs:`) so merge UIs cannot race ahead of GitHub's required-check registration.
3. Droplet never runs `vite build`.
4. Deploy uses atomic `anthonyl.im.next` → `anthonyl.im` swap + `/health` smoke.
5. PR previews (`preview.yml`) are not a merge gate. Same-repo only; never bake `VITE_DEV_BEARER`. Agents screenshot `/korea` and `/trips` via `bun scripts/clerk-agent-login.ts` (applies a Clerk Agent Task + Testing Token in Chrome; do not paste tickets; helper re-execs from `origin/main`; Cursor cloud `gh` tokens need the installation-token check or `CLERK_SECRET_KEY`). See `docs/pr-previews.md`.
