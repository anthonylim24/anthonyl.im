# Cursor Origin CI/CD

Origin does not run `.github/workflows` by itself. In early beta, CI on Origin is:

1. **Depot** or **Buildkite** on an **Origin-hosted** repository (they execute the existing GitHub Actions YAML and report Origin checks), or
2. **Cursor Automations** that call `bash deploy/origin/run.sh …` (works even while the GitHub mirror is inbound).

This repo keeps one job implementation and three runners:

| Runner | When it fires | Entry |
| --- | --- | --- |
| GitHub Actions | GitHub PRs + push to `main` | `.github/workflows/*` → `deploy/ci/*.sh` |
| Depot (Origin Apps) | Origin-hosted PRs + `main` | `.depot/workflows/*` |
| Origin automations / CLI | Origin PR/push events you wire up | `deploy/origin/run.sh` |

Job names stay `pr-server-tests`, `pr-frontend-typecheck`, `pr-frontend-build`, `pr-frontend-tests`, `pr-cloud-setup`, and the required aggregate **`pr-gate`**. Preview stays out of the gate. Production deploy is still: runner-built `frontend/dist` → SCP → atomic `anthonyl.im.next` swap → `/health` + SPA smoke.

## GitHub mirror vs Origin-hosted (read this first)

[Sync from GitHub](https://cursor.com/docs/origin/mirror-github.md) creates an **inbound** mirror. Official limits:

- GitHub Actions workflows and secrets do **not** sync as CI.
- Origin Apps (Depot, Buildkite, a custom checks app) **cannot** see inbound-mirrored repos and receive **no webhooks** for them.
- PRs still sync both ways. Merging on Origin updates GitHub, so today’s GitHub `deploy.yml` still ships the droplet.

Depot and Buildkite only work on **Origin-hosted** repos (created on Origin, or detached so Origin is the source of truth). Installations also reach repos Origin mirrors **out** to GitHub.

If you only synced GitHub → Origin, do one of:

1. Keep GitHub as source of truth. Use **Automations** (below) for Origin check-runs / comments. GitHub Actions remains the real gate and deployer.
2. **Detach from GitHub** (repo Settings → Danger Zone) so Origin is source of truth, then connect **Depot** from the Apps tab. Set `DEPLOY_GIT_URL` on the droplet if `git clone` should no longer use `git@github.com:anthonylim24/anthonyl.im.git`.

## One-time Origin console setup

### A. Depot (Origin-hosted only)

1. Open the Origin repo → **Settings → Apps → Manage Apps**.
2. Install **Depot** on the codebase, then enable it on this repository.
3. Copy secrets into Depot (same names as GitHub Actions):

   | Secret | Used by |
   | --- | --- |
   | `SSH_HOST` | preview + deploy |
   | `SSH_USERNAME` | preview + deploy |
   | `SSH_KEY` | preview + deploy |
   | `FRONTEND_ENV` | preview + deploy (never include `VITE_DEV_BEARER`) |
   | `ORIGIN_INSTALLATION_TOKEN` | optional; sticky Origin PR comments |

4. Variables:

   | Variable | Purpose |
   | --- | --- |
   | `ORIGIN_OWNER` / `ORIGIN_REPO` | Origin slug, e.g. `anthonylim24` / `anthonyl.im` |
   | `ORIGIN_PREVIEW_ENABLED` | `true` to let Depot publish `https://anthonyl.im/preview/pr/<n>/` |
   | `ORIGIN_DEPLOY_ENABLED` | `true` to let Depot deploy on `main` |
   | `DEPLOY_GIT_URL` | optional clone URL for the droplet stage step |

5. **Do not enable `ORIGIN_DEPLOY_ENABLED` while GitHub Actions still deploys.** Two runners would race the atomic swap. Cut over: enable the Depot flag, then disable or delete `.github/workflows/deploy.yml` (or its `on.push`).
6. Same for previews: enable `ORIGIN_PREVIEW_ENABLED` only when you want Depot (not GitHub) to publish.

`.depot/workflows/pr.yml` always runs once Depot is connected — those jobs are read-only and safe to double-run next to GitHub.

### B. Cursor Automations (works on a GitHub mirror)

Create three automations from [cursor.com/automations](https://cursor.com/automations) using the prompts in:

- [`.cursor/automations/origin-pr-checks.md`](../.cursor/automations/origin-pr-checks.md)
- [`.cursor/automations/origin-pr-preview.md`](../.cursor/automations/origin-pr-preview.md)
- [`.cursor/automations/origin-deploy.md`](../.cursor/automations/origin-deploy.md)

Each one must run:

```bash
bash deploy/origin/run.sh pr-checks
bash deploy/origin/run.sh preview
bash deploy/origin/run.sh preview-cleanup
bash deploy/origin/run.sh deploy
```

Put the same SSH / `FRONTEND_ENV` / Origin token secrets on the automation environment. `deploy` still requires `ORIGIN_DEPLOY_ENABLED=true`.

### C. Required check `pr-gate`

On Origin: **Settings → Rules and Protections**. Require the check key **`pr-gate`** on `main` (display name is ignored; the key is what matches). Keep GitHub branch protection on `pr-gate` as well (`.github/branch-protection.json`).

Reporting Origin check-runs needs an Origin App installation token with `repository:checks:write` (and `repository:pull_requests:reviews:write` for sticky preview comments). Create the app under [codebase Apps](https://cursor.com/codebase/settings/apps), install it on this repo, mint `oit_…` tokens, store as `ORIGIN_INSTALLATION_TOKEN`.

Inbound GitHub mirrors cannot install that app. Automations can still run the scripts; they just cannot write Origin checks until the repo is Origin-hosted.

## Local / agent commands

```bash
# Same PR jobs Origin and GitHub use
bash deploy/ci/server-tests.sh
bash deploy/ci/frontend-typecheck.sh
MODE=stub bash deploy/ci/frontend-build.sh
bash deploy/ci/frontend-tests.sh
bash deploy/ci/cloud-setup.sh

# Full Origin entrypoint (needs secrets for preview/deploy)
bash deploy/origin/run.sh pr-checks

# Report a check or sticky comment
bun server/src/originCi/cli.ts report-check --key pr-gate --status completed --conclusion success
bun server/src/originCi/cli.ts sticky-comment --pr 12 --body-file -
```

## Files

| Path | Role |
| --- | --- |
| `deploy/ci/*.sh` | Portable job bodies (GitHub + Depot + Origin) |
| `deploy/origin/run.sh` | Origin entrypoint + check reporting |
| `server/src/originCi/` | Origin Checks / comments / webhook helpers |
| `.depot/workflows/` | Depot copies (preview/deploy gated) |
| `.buildkite/pipeline.yml` | Optional Buildkite-gha import |
| `.cursor/automations/` | Paste-ready automation prompts |

## Invariants (do not break)

1. Droplet never runs `vite build`.
2. `pr-gate` is the only required merge check name.
3. Previews are not a merge gate. Same-repo only. No `VITE_DEV_BEARER`.
4. Text `bun.lock` only. `--frozen-lockfile` everywhere.
5. Enable only **one** production deploy trigger (GitHub **or** Origin/Depot).
