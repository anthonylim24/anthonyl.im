# Codex Cloud Setup

Use this when creating or updating the Codex cloud environment for this repo.

## Environment Settings

In Codex web, create an environment for `anthonylim24/anthonyl.im` and set:

- **Node.js:** `26`
- **Setup script:** `bash .codex/setup.sh`
- **Maintenance script:** `bash .codex/maintenance.sh`
- **Internet access:** setup needs internet for Bun and dependency installs. Agent-phase internet can stay off unless a task explicitly needs docs or external APIs.

Codex setup scripts run in a separate Bash session, so `.codex/setup.sh` also writes the Bun path and nvm loader to `~/.bashrc`. The scripts force Bun/npm to use `https://registry.npmjs.org/` so an inherited private `.npmrc` does not send public package installs to a registry that returns HTTP 403.

## Safe Default Environment

The setup script writes ignored local env files only when they are missing:

- `.env` from `.codex/root.env.example`
- `frontend/.env.local` from `.codex/frontend.env.local.example`

Those defaults are intentionally safe for cloud tasks:

- `KLUSTER_API_KEY=codex-stub`
- `KLUSTER_API_BASE_URL=https://example.invalid`
- `IG_WORKER_ENABLED=false`
- matching `IG_DEV_BEARER` / `VITE_DEV_BEARER` values for Clerk-free Korea route development
- `VITE_ENABLE_SERVICE_WORKER=false` to avoid stale PWA state in short-lived containers

Do not put production secrets in these files. For tasks that genuinely need live integrations, add narrowly scoped environment variables in Codex settings for that task or environment.

## Dependency Install

Setup installs both dependency roots with lockfile enforcement:

```bash
bun install --frozen-lockfile --registry=https://registry.npmjs.org/
cd frontend
bun install --frozen-lockfile --registry=https://registry.npmjs.org/
```

The setup script also verifies that representative root and frontend packages resolve after install. The maintenance script repeats the same installs when Codex resumes a cached container on a newer branch. If dependencies are missing when `codex:dev` or `codex:check` runs, those commands invoke maintenance before building, which catches the "missing react/vite/types" failure before TypeScript emits a wall of missing-module errors.

## Running Dev Servers

The easiest cloud command is:

```bash
bash .codex/dev.sh
```

That starts:

- root server: `http://localhost:3000`
- frontend Vite server: `http://localhost:5173`

The equivalent manual commands are:

```bash
bun dev
cd frontend
bun dev -- --host 0.0.0.0
```

## Validation

Run the cloud smoke checks with:

```bash
bash .codex/check.sh
```

It runs server tests with safe stub env and then the frontend TypeScript check.
