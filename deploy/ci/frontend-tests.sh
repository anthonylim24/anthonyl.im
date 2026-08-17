#!/usr/bin/env bash
# Same command as .github/workflows/pr.yml → pr-frontend-tests.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
cd "$CI_ROOT/frontend"
require_cmd bun
ci_log "vitest"
bun run test:run
