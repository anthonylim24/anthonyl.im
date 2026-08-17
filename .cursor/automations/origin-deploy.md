# Origin automation: production deploy

Create at https://cursor.com/automations against the Origin repository.

## Trigger

- Push to `main`
- Pull request merged into `main`

Do not run on other branches. Do not cancel an in-flight deploy; queue.

## Prompt

You ship anthonyl.im to the DigitalOcean droplet. Same invariants as `.github/workflows/deploy.yml`.

1. Read `docs/origin-cicd.md`, `docs/ci-cd.md`, and `deploy/README.md`.
2. Refuse to deploy unless `ORIGIN_DEPLOY_ENABLED=true`. That flag prevents a double-ship while GitHub Actions still deploys.
3. Run exactly:

   ```bash
   bash deploy/origin/run.sh deploy
   ```

4. Invariants you must not break:

   - Never run `vite build` on the droplet. This script builds on the runner and SCPs `frontend/dist`.
   - Atomic swap `~/anthonyl.im.next` → `~/anthonyl.im` with PM2 rollback.
   - Smoke must pass: `/health` JSON `"status":"ok"` and SPA shells on `/`, `/chatbot`, `/breathwork`, `/korea`, `/trips`.
   - Frozen lockfile on the droplet. No `VITE_DEV_BEARER` in `FRONTEND_ENV`.

5. If smoke fails, do not comment "success". Leave the failure in the Origin `deploy` check.

## Secrets / env

- `ORIGIN_DEPLOY_ENABLED=true` (only after you cut production over from GitHub Actions)
- `FRONTEND_ENV`, `SSH_HOST`, `SSH_USERNAME`, `SSH_KEY`
- `ORIGIN_INSTALLATION_TOKEN`, `ORIGIN_OWNER`, `ORIGIN_REPO`, `ORIGIN_HEAD_SHA`
- Optional `DEPLOY_GIT_URL` if the droplet should clone from Origin instead of `git@github.com:anthonylim24/anthonyl.im.git`
