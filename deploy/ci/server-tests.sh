#!/usr/bin/env bash
# Same command as .github/workflows/pr.yml → pr-server-tests.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
cd "$CI_ROOT"
require_cmd bun
ci_log "bun test --bail server/src"
bun test --bail server/src
