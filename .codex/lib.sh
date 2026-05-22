#!/usr/bin/env bash

PUBLIC_NPM_REGISTRY="${PUBLIC_NPM_REGISTRY:-https://registry.npmjs.org/}"
PUBLIC_NPM_REGISTRY_ARG="--registry=${PUBLIC_NPM_REGISTRY}"

export NPM_CONFIG_REGISTRY="$PUBLIC_NPM_REGISTRY"
export npm_config_registry="$PUBLIC_NPM_REGISTRY"

# Frontend-required dev tooling. Keeping this list explicit (rather than
# just trusting `node_modules` existence) catches the recent cloud failure
# mode where root-level `bun install` ran but the frontend tree was empty,
# so `tsc -b` resolved the root's TS 5.x and choked on `ignoreDeprecations`.
FRONTEND_REQUIRED_PACKAGES=(react react-dom vite typescript '@vitejs/plugin-react')
ROOT_REQUIRED_PACKAGES=(hono zod openai)

run_bun_install() {
  local directory="$1"
  local label="$2"

  cd "$directory"
  echo "[codex-deps] installing ${label} dependencies from ${PUBLIC_NPM_REGISTRY}"
  if ! bun install --frozen-lockfile "$PUBLIC_NPM_REGISTRY_ARG"; then
    echo "[codex-deps] ERROR: ${label} bun install failed in ${directory}" >&2
    return 1
  fi
}

preflight_registry() {
  echo "[codex-deps] checking npm registry access: ${PUBLIC_NPM_REGISTRY}"
  if bun pm view react version "$PUBLIC_NPM_REGISTRY_ARG" >/dev/null; then
    return 0
  fi

  cat >&2 <<EOF
[codex-deps] ERROR: cannot reach ${PUBLIC_NPM_REGISTRY}.
[codex-deps] Dependency installation must run during Codex setup/maintenance with internet access.
[codex-deps] If this reports HTTP 403, check that the Codex environment is not inheriting a private npm registry.
EOF
  return 1
}

resolve_package() {
  local directory="$1"
  local package_name="$2"

  (
    cd "$directory"
    bun --print "require.resolve('${package_name}/package.json')" 2>/dev/null
  )
}

# Resolve a package from $directory AND require the resolved path to live
# inside $directory/node_modules. Bun's resolver walks up the tree, so
# resolving a frontend dep from frontend/ can silently fall back to root's
# node_modules — exactly the cloud failure mode we're trying to prevent.
resolve_package_locally() {
  local directory="$1"
  local package_name="$2"

  local resolved
  resolved="$(resolve_package "$directory" "$package_name")"
  if [ -z "$resolved" ]; then
    return 1
  fi
  case "$resolved" in
    "$directory"/node_modules/*) return 0 ;;
    *) return 1 ;;
  esac
}

verify_dependency_roots() {
  local missing=0

  for package_name in "${ROOT_REQUIRED_PACKAGES[@]}"; do
    if ! resolve_package_locally "$ROOT_DIR" "$package_name"; then
      echo "[codex-deps] missing root dependency: ${package_name}" >&2
      missing=1
    fi
  done

  for package_name in "${FRONTEND_REQUIRED_PACKAGES[@]}"; do
    if ! resolve_package_locally "$ROOT_DIR/frontend" "$package_name"; then
      echo "[codex-deps] missing frontend dependency: ${package_name} (not in frontend/node_modules)" >&2
      missing=1
    fi
  done

  return "$missing"
}

install_dependency_roots() {
  preflight_registry
  run_bun_install "$ROOT_DIR" "root"
  run_bun_install "$ROOT_DIR/frontend" "frontend"

  if ! verify_dependency_roots; then
    cat >&2 <<'EOF'
[codex-deps] ERROR: dependency verification failed after install.
[codex-deps] Either the lockfile is out of sync with package.json or the install was incomplete.
[codex-deps] Try: rm -rf node_modules frontend/node_modules && bash .codex/setup.sh
EOF
    return 1
  fi
}

ensure_dependencies() {
  if verify_dependency_roots >/dev/null 2>&1; then
    return 0
  fi

  echo "[codex-deps] dependency roots are incomplete; attempting auto-repair via .codex/maintenance.sh"
  if ! "$ROOT_DIR/.codex/maintenance.sh"; then
    cat >&2 <<'EOF'
[codex-deps] ERROR: maintenance.sh failed.
[codex-deps] Re-run the full Codex setup script with internet access: bash .codex/setup.sh
EOF
    return 1
  fi

  if verify_dependency_roots; then
    return 0
  fi

  cat >&2 <<'EOF'
[codex-deps] ERROR: dependencies are still missing after repair.
[codex-deps] Most common cause: frontend/node_modules is empty (root install ran but frontend didn't).
[codex-deps] Fix: bash .codex/setup.sh
[codex-deps] If that fails, a clean reinstall: rm -rf node_modules frontend/node_modules && bash .codex/setup.sh
EOF
  return 1
}

# Verifies the frontend's TypeScript resolves to the pinned ~6.0 line so
# `tsc -b` matches what the build expects. This catches the cloud-sandbox
# failure mode where only the root tree was installed and `bunx tsc`
# silently fell back to the root's TS 5.x, which rejects
# `ignoreDeprecations: "6.0"` in tsconfig.app.json and can't see the
# vite / plugin-react types pinned by frontend/package.json.
verify_frontend_typescript() {
  local ts_version
  if ! ts_version="$(cd "$ROOT_DIR/frontend" && bunx --bun tsc --version 2>/dev/null)"; then
    cat >&2 <<'EOF'
[codex-deps] ERROR: could not run `tsc --version` in frontend/.
[codex-deps] This usually means frontend/node_modules is missing.
[codex-deps] Run: bash .codex/setup.sh
EOF
    return 1
  fi

  if [[ "$ts_version" =~ ^Version[[:space:]]6\. ]]; then
    echo "[codex-deps] frontend ${ts_version}"
    return 0
  fi

  cat >&2 <<EOF
[codex-deps] ERROR: frontend TypeScript reports "${ts_version}" but ~6.0 is expected.
[codex-deps] This usually means frontend/node_modules wasn't installed and tsc is
[codex-deps] resolving from the root tree. Fix: bash .codex/setup.sh
EOF
  return 1
}
