#!/usr/bin/env bash
# Pack the preview frontend + API source the same way preview.yml does.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
cd "$CI_ROOT"
tar -C frontend/dist -czf preview-pr.tar.gz .
tar -czf preview-api.tar.gz server/src
test -f preview-pr.tar.gz && test -f preview-api.tar.gz
ci_log "packed preview-pr.tar.gz and preview-api.tar.gz"
