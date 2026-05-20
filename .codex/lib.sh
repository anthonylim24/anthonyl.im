#!/usr/bin/env bash

PUBLIC_NPM_REGISTRY="${PUBLIC_NPM_REGISTRY:-https://registry.npmjs.org/}"
PUBLIC_NPM_REGISTRY_ARG="--registry=${PUBLIC_NPM_REGISTRY}"

export NPM_CONFIG_REGISTRY="$PUBLIC_NPM_REGISTRY"
export npm_config_registry="$PUBLIC_NPM_REGISTRY"

run_bun_install() {
  local directory="$1"
  local label="$2"

  cd "$directory"
  echo "[codex-deps] installing ${label} dependencies from ${PUBLIC_NPM_REGISTRY}"
  bun install --frozen-lockfile "$PUBLIC_NPM_REGISTRY_ARG"
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
    bun --print "require.resolve('${package_name}/package.json')" >/dev/null 2>&1
  )
}

verify_dependency_roots() {
  local missing=0

  for package_name in hono zod openai; do
    if ! resolve_package "$ROOT_DIR" "$package_name"; then
      echo "[codex-deps] missing root dependency: ${package_name}" >&2
      missing=1
    fi
  done

  for package_name in react react-dom vite typescript '@vitejs/plugin-react'; do
    if ! resolve_package "$ROOT_DIR/frontend" "$package_name"; then
      echo "[codex-deps] missing frontend dependency: ${package_name}" >&2
      missing=1
    fi
  done

  return "$missing"
}

install_dependency_roots() {
  preflight_registry
  run_bun_install "$ROOT_DIR" "root"
  run_bun_install "$ROOT_DIR/frontend" "frontend"
  verify_dependency_roots
}

ensure_dependencies() {
  if verify_dependency_roots >/dev/null 2>&1; then
    return 0
  fi

  echo "[codex-deps] dependency roots are incomplete; attempting repair"
  "$ROOT_DIR/.codex/maintenance.sh"

  if verify_dependency_roots; then
    return 0
  fi

  cat >&2 <<'EOF'
[codex-deps] ERROR: dependencies are still missing after repair.
[codex-deps] Re-run the Codex setup script with internet access: bash .codex/setup.sh
EOF
  return 1
}
