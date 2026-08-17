#!/usr/bin/env bash

# Execute a Clerk Backend API request with scope enforcement.
#
# Usage: bash execute-request.sh [--admin] <METHOD> <PATH> [BODY]
#
# Scope enforcement:
#   GET     — always allowed
#   POST, PUT, PATCH — requires CLERK_BAPI_SCOPES="write" or --admin flag
#   DELETE  — requires CLERK_BAPI_SCOPES="write,delete" or --admin flag

set -euo pipefail

# Safely parse only Clerk keys from a KEY=VALUE env file.
# Never source/eval/set -a — file contents must not run as shell.
_clerk_env_preset_secret=0
_clerk_env_preset_scopes=0
_clerk_env_preset_url=0
[[ -n "${CLERK_SECRET_KEY:-}" ]] && _clerk_env_preset_secret=1
[[ -n "${CLERK_BAPI_SCOPES:-}" ]] && _clerk_env_preset_scopes=1
[[ -n "${CLERK_REST_API_URL:-}" ]] && _clerk_env_preset_url=1

_apply_clerk_env_kv() {
  local key="$1" value="$2"
  case "$key" in
    CLERK_SECRET_KEY)   [[ "$_clerk_env_preset_secret" == 1 ]] && return 0 ;;
    CLERK_BAPI_SCOPES)  [[ "$_clerk_env_preset_scopes" == 1 ]] && return 0 ;;
    CLERK_REST_API_URL) [[ "$_clerk_env_preset_url" == 1 ]] && return 0 ;;
    *) return 0 ;;
  esac
  value="${value%$'\r'}"
  if [[ ${#value} -ge 2 ]]; then
    local first="${value:0:1}" last="${value: -1}"
    if [[ ( "$first" == '"' && "$last" == '"' ) || ( "$first" == "'" && "$last" == "'" ) ]]; then
      value="${value:1:${#value}-2}"
    fi
  fi
  printf -v "$key" '%s' "$value"
  export "$key"
}

_load_clerk_env_file() {
  local file="$1" line key value
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    if [[ "$line" =~ ^[[:space:]]*export[[:space:]]+ ]]; then
      line="${line#*export}"
      line="${line#"${line%%[![:space:]]*}"}"
    fi
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"
    value="${line#*=}"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    case "$key" in
      CLERK_SECRET_KEY|CLERK_BAPI_SCOPES|CLERK_REST_API_URL)
        _apply_clerk_env_kv "$key" "$value"
        ;;
    esac
  done < "$file"
}

# Walk up from $PWD to find .env/.env.local (mirrors Clerk CLI behavior).
# Stops at the first directory that provides CLERK_SECRET_KEY.
# .env.local overrides .env in the same directory; process-env wins over files.
_dir="$PWD"
while true; do
  _load_clerk_env_file "$_dir/.env"
  _load_clerk_env_file "$_dir/.env.local"
  [[ -n "${CLERK_SECRET_KEY:-}" ]] && break
  _parent="$(dirname "$_dir")"
  [[ "$_parent" == "$_dir" ]] && break
  _dir="$_parent"
done
unset _dir _parent
unset -f _apply_clerk_env_kv _load_clerk_env_file
unset _clerk_env_preset_secret _clerk_env_preset_scopes _clerk_env_preset_url

# Parse --admin flag
ADMIN=false
if [[ "${1:-}" == "--admin" ]]; then
  ADMIN=true
  shift
fi

METHOD="${1:?Usage: execute-request.sh [--admin] <METHOD> <PATH> [BODY]}"
PATH_ARG="${2:?Usage: execute-request.sh [--admin] <METHOD> <PATH> [BODY]}"
BODY="${3:-}"

METHOD_UPPER=$(echo "$METHOD" | tr '[:lower:]' '[:upper:]')
SCOPES="${CLERK_BAPI_SCOPES:-}"

# Scope check
if [[ "$ADMIN" == false ]]; then
  case "$METHOD_UPPER" in
    GET)
      ;; # always allowed
    POST|PUT|PATCH)
      if [[ "$SCOPES" != *"write"* ]]; then
        echo "ERROR: $METHOD_UPPER requests require CLERK_BAPI_SCOPES=\"write\" or --admin flag." >&2
        echo "Current CLERK_BAPI_SCOPES: \"$SCOPES\"" >&2
        exit 1
      fi
      ;;
    DELETE)
      if [[ "$SCOPES" != *"write"* ]] || [[ "$SCOPES" != *"delete"* ]]; then
        echo "ERROR: DELETE requests require CLERK_BAPI_SCOPES=\"write,delete\" or --admin flag." >&2
        echo "Current CLERK_BAPI_SCOPES: \"$SCOPES\"" >&2
        exit 1
      fi
      ;;
    *)
      echo "ERROR: Unknown HTTP method: $METHOD_UPPER" >&2
      exit 1
      ;;
  esac
fi

# Base URL: use CLERK_REST_API_URL if set, otherwise default to production
BASE_URL="${CLERK_REST_API_URL:-https://api.clerk.com}"

# Build curl command
CURL_ARGS=(
  -s
  -X "$METHOD_UPPER"
  "${BASE_URL}/v1${PATH_ARG}"
  -H "Authorization: Bearer ${CLERK_SECRET_KEY:?CLERK_SECRET_KEY is not set}"
  -H "Content-Type: application/json"
)

if [[ -n "$BODY" ]]; then
  CURL_ARGS+=(-d "$BODY")
fi

curl "${CURL_ARGS[@]}"
