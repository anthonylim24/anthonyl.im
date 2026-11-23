#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLIC_REGISTRY="https://registry.npmjs.org/"

assert_contains() {
  local file="$1"
  local needle="$2"

  if ! grep -qF -- "$needle" "$ROOT_DIR/$file"; then
    echo "[codex-cloud-test] expected $file to contain: $needle" >&2
    exit 1
  fi
}

assert_executable() {
  local file="$1"

  if [ ! -x "$ROOT_DIR/$file" ]; then
    echo "[codex-cloud-test] expected $file to be executable" >&2
    exit 1
  fi
}

bash -n \
  "$ROOT_DIR/.codex/setup.sh" \
  "$ROOT_DIR/.codex/maintenance.sh" \
  "$ROOT_DIR/.codex/dev.sh" \
  "$ROOT_DIR/.codex/check.sh" \
  "$ROOT_DIR/.codex/lib.sh"

assert_executable ".codex/setup.sh"
assert_executable ".codex/maintenance.sh"
assert_executable ".codex/dev.sh"
assert_executable ".codex/check.sh"

assert_contains ".codex/lib.sh" "$PUBLIC_REGISTRY"
assert_contains ".codex/lib.sh" "verify_dependency_roots"
assert_contains ".codex/lib.sh" "verify_frontend_typescript"
# Frontend dep list must include the bits that broke the recent cloud run.
assert_contains ".codex/lib.sh" "vite"
assert_contains ".codex/lib.sh" "@vitejs/plugin-react"
assert_contains ".codex/lib.sh" "typescript"
assert_contains ".codex/setup.sh" "install_dependency_roots"
assert_contains ".codex/maintenance.sh" "install_dependency_roots"
assert_contains ".codex/dev.sh" "ensure_dependencies"
assert_contains ".codex/check.sh" "ensure_dependencies"
# The TS-resolution pre-flight must run as part of the gate.
assert_contains ".codex/check.sh" "verify_frontend_typescript"

assert_contains ".github/actions/setup-ci/action.yml" "oven-sh/setup-bun@"
assert_contains ".github/actions/setup-ci/action.yml" "Set up Bun (retry)"
# (e.g. GEMINI_BASE pre-PR-#398) must exist so `bun test server/src`
# evaluates the real app dependency graph.
[ -f "$ROOT_DIR/server/src/appLoad.test.ts" ] || {
  echo "[codex-cloud-test] missing server/src/appLoad.test.ts (module-load smoke test)" >&2
  exit 1
}

# Remote PR previews: workflow exists, is not part of pr-gate, and the
# droplet publish script is executable + syntactically valid.
[ -f "$ROOT_DIR/.github/workflows/preview.yml" ] || {
  echo "[codex-cloud-test] missing .github/workflows/preview.yml" >&2
  exit 1
}
assert_contains ".github/workflows/preview.yml" "/preview/pr/"
assert_contains ".github/workflows/preview.yml" "write-frontend-env.sh .env --preview"
assert_contains ".github/workflows/deploy.yml" "write-frontend-env.sh frontend/.env"
assert_contains ".github/workflows/preview.yml" "dependabot[bot]"
assert_contains ".github/workflows/preview.yml" "head.repo.full_name"
if grep -A30 '^  pr-gate:' "$ROOT_DIR/.github/workflows/pr.yml" | grep -q 'preview'; then
  echo "[codex-cloud-test] preview must not be a pr-gate dependency" >&2
  exit 1
fi
assert_executable "deploy/publish-preview.sh"
bash -n "$ROOT_DIR/deploy/publish-preview.sh"
# Production runs as the anthonyl.im systemd unit, which every deploy
# installs from the release it starts.
assert_executable "deploy/install-service.sh"
bash -n "$ROOT_DIR/deploy/install-service.sh"
assert_contains ".github/workflows/deploy.yml" "deploy/install-service.sh"
assert_contains "deploy/systemd/anthonyl.im.service" "ExecStart=/root/.bun/bin/bun run index.ts"
# The deploy restarts it through restart.sh, which keeps a bridge on :3000
# (SO_REUSEPORT, so the unit must set REUSE_PORT).
assert_executable "deploy/restart.sh"
bash -n "$ROOT_DIR/deploy/restart.sh"
assert_contains ".github/workflows/deploy.yml" "deploy/restart.sh"
assert_contains "deploy/systemd/anthonyl.im.service" "Environment=REUSE_PORT=1"
# A preview .env carries the production Clerk key, never the dev bearer,
# with the service worker off and the API on the PR's sidecar.
assert_executable "deploy/write-frontend-env.sh"
ENV_OUT="$(mktemp)"
FRONTEND_ENV=$'VITE_DEV_BEARER=x\nVITE_CLERK_PUBLISHABLE_KEY=pk_test_x\nVITE_ENABLE_SERVICE_WORKER=true' \
  IN_CLERK_PUBLISHABLE_KEY=pk_live_x \
  bash "$ROOT_DIR/deploy/write-frontend-env.sh" "$ENV_OUT" --preview 7
for line in VITE_CLERK_PUBLISHABLE_KEY=pk_live_x VITE_ENABLE_SERVICE_WORKER=false VITE_API_BASE=/preview/pr/7; do
  grep -qxF "$line" "$ENV_OUT" || {
    echo "[codex-cloud-test] preview .env is missing: $line" >&2
    exit 1
  }
done
if grep -qE 'VITE_DEV_BEARER|pk_test_|SERVICE_WORKER=true' "$ENV_OUT"; then
  echo "[codex-cloud-test] preview .env kept a line it must replace or drop" >&2
  exit 1
fi
rm -f "$ENV_OUT"
assert_contains "deploy/publish-preview.sh" "preview.json"
[ -f "$ROOT_DIR/server/src/preview.ts" ] || {
  echo "[codex-cloud-test] missing server/src/preview.ts" >&2
  exit 1
}

echo "[codex-cloud-test] setup script invariants passed"
