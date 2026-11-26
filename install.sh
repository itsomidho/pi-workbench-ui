#!/usr/bin/env bash
# Install or update a release archive without Git.
main() {
set -euo pipefail

version=v0.9.0
destination="${HOME:?HOME must be set}/.pi-workbench-ui"
register=true
usage() {
  printf '%s\n' 'Usage: bash install.sh [--version vX.Y.Z] [--dir /absolute/path] [--no-register]' \
    'Defaults: --version v0.9.0 --dir ~/.pi-workbench-ui' \
    'Requires Bash, curl, tar, Node.js 22.13+, GNU mv, and Pi for fresh registration.' \
    'Recognized older archive installs are backed up and updated. Git checkouts and symlinks are refused.'
}
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --version|--dir)
      [ "$#" -ge 2 ] && [ -n "$2" ] || fail "Missing value for $1"
      if [ "$1" = --version ]; then version="$2"; else destination="$2"; fi
      shift 2 ;;
    --no-register) register=false; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done
[[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'Version must be a release tag such as v0.9.0'
# Normalize trailing slashes so dangling symlinks are detected too.
while [[ "$destination" = */ ]]; do destination="${destination%/}"; done
[[ "$destination" = /* ]] && [ "$destination" != / ] || fail 'Installation directory must be an absolute path other than /'
[[ "$destination" != */. && "$destination" != */.. ]] || fail 'Installation directory must end in a directory name'
for command in curl tar node mktemp mv; do command -v "$command" >/dev/null 2>&1 || fail "Required command not found: $command"; done
node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(major<22 || (major===22 && minor<13)) process.exit(1)' || fail 'Node.js 22.13+ is required'
mv --version >/dev/null 2>&1 || fail 'GNU mv is required'
parent="$(dirname -- "$destination")"
mkdir -p -- "$parent"
lock="$destination.install-lock"
mkdir -- "$lock" 2>/dev/null || fail "Cannot acquire install lock: $lock (another installer may be running)"
staging= backup=
cleanup() {
  local status=$?
  if [[ -n "$backup" && -d "$backup/previous" && ! -e "$destination" && ! -L "$destination" ]]; then
    if mv -T -n -- "$backup/previous" "$destination" && [ ! -e "$backup/previous" ]; then
      printf 'Restored previous installation.\n' >&2
    else
      printf 'Restore failed; previous installation saved at %s/previous\n' "$backup" >&2
    fi
  fi
  if [ -n "$backup" ]; then rmdir -- "$backup" 2>/dev/null || true; fi
  if [ -n "$staging" ]; then rm -rf -- "$staging" || true; fi
  rmdir -- "$lock" || true
  return "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
inspect_package() {
node - "$1" "${version#v}" "$2" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const [directory, version, mode] = process.argv.slice(2);
function regular(file) {
  const name = path.join(directory, file);
  if (!fs.lstatSync(name).isFile()) throw new Error(`Invalid package file: ${file}`);
  return name;
}
const pkg = JSON.parse(fs.readFileSync(regular('package.json'), 'utf8'));
if (pkg.name !== 'pi-workbench-ui' || typeof pkg.version !== 'string' ||
    !/^\d+\.\d+\.\d+$/.test(pkg.version) ||
    !Array.isArray(pkg.pi?.extensions) || !pkg.pi.extensions.includes('./index.ts') ||
    (mode === 'download' && pkg.version !== version)) {
  throw new Error('Unexpected package name, version or extension manifest');
}
const installed = pkg.version.split('.').map(BigInt);
const target = version.split('.').map(BigInt);
const [major, minor] = installed;
for (const file of ['index.ts', 'settings.ts', 'ask.ts']) regular(file);
if (major > 0n || minor >= 4n) regular('prompt-borders.ts');
if (major > 0n || minor >= 7n) regular('token-usage.ts');
if (major > 0n || minor >= 8n) { regular('task-usage.ts'); regular('task-dashboard.ts'); }
if (major > 0n || minor >= 9n) { regular('prompt-suggestions.ts'); regular('activity-status.ts'); }
if (mode === 'installed') {
  const difference = installed.findIndex((part, index) => part !== target[index]);
  console.log(difference === -1 ? 'same' : installed[difference] < target[difference] ? 'older' : 'newer');
  console.log(pkg.version);
}
NODE
}
updating=false
if [ -L "$destination" ]; then fail "Refusing to replace a symlink: $destination"; fi
if [ -e "$destination" ]; then
  [ -d "$destination" ] || fail "Not an installation directory: $destination"
  [ ! -e "$destination/.git" ] && [ ! -L "$destination/.git" ] || fail "Git checkout detected: $destination (use Git to update it)"
  result="$(inspect_package "$destination" installed 2>/dev/null)" || fail "Not a recognized pi-workbench-ui archive install: $destination"
  installed_version="${result#*$'\n'}"
  case "${result%%$'\n'*}" in
    same) printf 'pi-workbench-ui %s is already up to date at %s.\n' "$version" "$destination"; exit 0 ;;
    newer) fail "Installed v$installed_version is newer than $version; refusing to downgrade" ;;
    older) updating=true ;;
  esac
fi
if ! "$updating" && "$register"; then command -v pi >/dev/null 2>&1 || fail 'Pi is not installed or not on PATH'; fi
staging="$(mktemp -d "$parent/.pi-workbench-ui-install.XXXXXX")"
printf 'Downloading pi-workbench-ui %s…\n' "$version"
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --tlsv1.2 \
  --retry 2 --connect-timeout 15 --max-time 120 \
  "https://github.com/itsomidho/pi-workbench-ui/archive/refs/tags/$version.tar.gz" \
  --output "$staging/package.tar.gz"
mkdir "$staging/package"
tar -xzf "$staging/package.tar.gz" --strip-components=1 --no-same-owner --no-same-permissions -C "$staging/package"
inspect_package "$staging/package" download
if "$updating"; then
  backup="$(mktemp -d "$destination.backup.XXXXXX")"
  printf 'Backing up v%s to %s/previous\n' "$installed_version" "$backup"
  mv -T -n -- "$destination" "$backup/previous"
  [ -d "$backup/previous" ] || fail 'Could not back up existing installation'
fi
# -n refuses any destination that appeared during installation; -T avoids nesting.
mv -T -n -- "$staging/package" "$destination"
[ ! -e "$staging/package" ] || fail "Destination appeared during installation: $destination"
printf 'Installed %s at %s\n' "$version" "$destination"
if "$updating"; then
  printf 'Existing Pi registration left unchanged.\n'
elif "$register"; then
  if ! pi install "$destination"; then
    printf 'Pi registration failed. Files were preserved. Retry: pi install %q\n' "$destination" >&2
    exit 1
  fi
else
  printf 'Registration skipped. Register with: pi install %q\n' "$destination"
fi
printf 'Run /reload in your existing Pi session.\n'
}
main "$@"
