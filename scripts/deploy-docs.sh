#!/usr/bin/env bash

set -euo pipefail

fail() {
  printf 'docs deploy: %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

is_safe_remote_path() {
  [[ "$1" =~ ^/[A-Za-z0-9._/-]+$ ]]
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
docs_dir="$repo_root/apps/docs"

vps_host="${NITROPUSH_VPS_HOST:-}"
vps_user="${NITROPUSH_VPS_USER:-}"
vps_port="${NITROPUSH_VPS_PORT:-22}"
identity_file="${NITROPUSH_VPS_IDENTITY_FILE:-}"
docs_url="${NITROPUSH_DOCS_URL:-}"
docs_base_url="${NITROPUSH_DOCS_BASE_URL:-/}"
remote_root="${NITROPUSH_DOCS_PATH:-/opt/nitrowind-docs}"
docs_port="${NITROPUSH_DOCS_PORT:-8080}"

[[ -n "$vps_host" ]] || fail "set NITROPUSH_VPS_HOST to the VPS hostname or IP address"
[[ -n "$docs_url" ]] || fail "set NITROPUSH_DOCS_URL to the public documentation URL"
[[ "$vps_port" =~ ^[0-9]+$ && "$vps_port" -ge 1 && "$vps_port" -le 65535 ]] || fail "NITROPUSH_VPS_PORT must be a valid port"
[[ "$docs_port" =~ ^[0-9]+$ && "$docs_port" -ge 1 && "$docs_port" -le 65535 ]] || fail "NITROPUSH_DOCS_PORT must be a valid port"
is_safe_remote_path "$remote_root" || fail "NITROPUSH_DOCS_PATH must be an absolute, shell-safe path"
[[ "$remote_root" != "/" ]] || fail "NITROPUSH_DOCS_PATH cannot be the filesystem root"

case "$docs_base_url" in
  / | /*/) ;;
  *) fail "NITROPUSH_DOCS_BASE_URL must start and end with a slash" ;;
esac

require_command ssh
require_command tar
require_command yarn

if [[ -n "$identity_file" ]]; then
  [[ -f "$identity_file" ]] || fail "NITROPUSH_VPS_IDENTITY_FILE does not exist: $identity_file"
fi

target="$vps_host"
if [[ -n "$vps_user" ]]; then
  target="$vps_user@$vps_host"
fi

ssh_args=(-p "$vps_port")
if [[ -n "$identity_file" ]]; then
  ssh_args+=(-i "$identity_file")
fi

release_id="$(date -u +%Y%m%d%H%M%S)"
release_dir="$remote_root/releases/$release_id"

printf 'Building documentation for %s%s\n' "$docs_url" "$docs_base_url"
cd "$repo_root"
DOCS_URL="$docs_url" DOCS_BASE_URL="$docs_base_url" yarn docs:build

standalone_dir="$docs_dir/.next/standalone"
[[ -f "$standalone_dir/apps/docs/server.js" ]] || fail "Next.js standalone server was not generated"

stage_dir="$(mktemp -d)"
trap 'rm -rf "$stage_dir"' EXIT
mkdir -p "$stage_dir/standalone/apps/docs/.next"
cp -R "$standalone_dir/." "$stage_dir/standalone/"
cp -R "$docs_dir/.next/static" "$stage_dir/standalone/apps/docs/.next/static"
cp -R "$docs_dir/public" "$stage_dir/standalone/apps/docs/public"
cp "$docs_dir/compose.vps.yaml" "$stage_dir/compose.vps.yaml"

printf 'Uploading release %s to %s\n' "$release_id" "$target"
ssh "${ssh_args[@]}" "$target" "mkdir -p '$release_dir'"
tar -C "$stage_dir" -czf - standalone compose.vps.yaml |
  ssh "${ssh_args[@]}" "$target" "tar -xzf - -C '$release_dir'"

printf 'Starting documentation container on the VPS\n'
ssh "${ssh_args[@]}" "$target" "
  set -eu
  mkdir -p '$remote_root'
  cp '$release_dir/compose.vps.yaml' '$remote_root/compose.vps.yaml'
  ln -sfn '$release_dir' '$remote_root/current'
  cd '$remote_root'
  DOCS_PORT='$docs_port' docker compose -f compose.vps.yaml up -d --force-recreate --remove-orphans
  docker compose -f compose.vps.yaml ps
  find '$remote_root/releases' -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +
"

printf 'Documentation deployed: %s\n' "$docs_url"
