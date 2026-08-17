#!/usr/bin/env bash
# Same steps as .github/workflows/pr.yml → pr-cloud-setup.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
cd "$CI_ROOT"
ci_log "codex setup"
bash .codex/setup.sh
ci_log "codex check"
bash .codex/check.sh
ci_log "setup-invariant lints"
bash .codex/cloud-setup.test.sh
bash .claude/cloud/cloud-setup.test.sh
