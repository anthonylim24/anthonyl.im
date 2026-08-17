# Origin automation: PR checks

Create at https://cursor.com/automations against the Origin repository.

## Trigger

Any of:

- Pull request opened
- Pull request pushed
- Draft marked ready / pull request published

Same-repo only. Skip Dependabot / fork PRs.

## Prompt

You are the anthonyl.im PR gate. Do not invent extra checks. Do not modify files.

1. Read `docs/origin-cicd.md` and `docs/ci-cd.md`.
2. From the repo root run exactly:

   ```bash
   bash deploy/origin/run.sh pr-checks
   ```

3. Required jobs (must all pass; names are Origin check keys):

   - `pr-server-tests`
   - `pr-frontend-typecheck`
   - `pr-frontend-build`
   - `pr-frontend-tests`
   - `pr-cloud-setup`
   - aggregate `pr-gate`

4. If `ORIGIN_INSTALLATION_TOKEN` is set, the script reports those checks to Origin. Do not post a review unless the gate failed; then comment with the failed job names only.
5. Never bake `VITE_DEV_BEARER`. Never deploy. Never publish a preview (a sibling automation does that).

## Secrets / env

- `ORIGIN_INSTALLATION_TOKEN` (or `ORIGIN_TOKEN`)
- `ORIGIN_OWNER` + `ORIGIN_REPO`
- `ORIGIN_HEAD_SHA` = PR head SHA
- `ORIGIN_DETAILS_URL` = this automation run URL
