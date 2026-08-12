# CI/CD agent memory

Pointer: full reference lives at [`docs/ci-cd.md`](../../docs/ci-cd.md).

Read that before changing `.github/workflows/*`, `.github/actions/*`, `.github/dependabot.yml`, `.codex/check.sh`, or deploy behavior.

Hard rules:

1. Text `bun.lock` only (never reintroduce `bun.lockb`).
2. Branch protection requires only the aggregate check named `pr-gate`.
3. Droplet never runs `vite build`.
4. Deploy uses atomic `anthonyl.im.next` → `anthonyl.im` swap + `/health` smoke.
