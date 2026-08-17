# Origin automation: PR preview

Create at https://cursor.com/automations against the Origin repository.

## Trigger

Same as PR checks (opened / pushed / ready). Separate automation so a droplet blip cannot fail `pr-gate`.

On pull request closed (not merged-only): run cleanup.

## Prompt

You publish the same remote preview as `.github/workflows/preview.yml`.

1. Read `docs/pr-previews.md` and `docs/origin-cicd.md`.
2. Set `PR_NUMBER`, `PR_SHA` / `ORIGIN_HEAD_SHA`, `PR_URL` from the triggering pull request.
3. For open/sync:

   ```bash
   bash deploy/origin/run.sh preview
   ```

4. For closed:

   ```bash
   bash deploy/origin/run.sh preview-cleanup
   ```

5. Preview URL is always `https://anthonyl.im/preview/pr/<n>/` with the loopback API at `/preview/pr/<n>/api/*`. Do not fall back to production `/api`. Do not bake `VITE_DEV_BEARER`.
6. Same-repo only. Skip Dependabot and forks.
7. This is not a merge gate. If publish fails, leave the sticky `<!-- pr-preview -->` failure comment and stop.

## Secrets / env

- `FRONTEND_ENV` (same body as the GitHub Actions secret; `VITE_DEV_BEARER` is stripped)
- `SSH_HOST`, `SSH_USERNAME`, `SSH_KEY`
- `ORIGIN_INSTALLATION_TOKEN`, `ORIGIN_OWNER`, `ORIGIN_REPO`
- `ORIGIN_PREVIEW_ENABLED=true`
