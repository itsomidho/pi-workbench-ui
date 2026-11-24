#!/usr/bin/env bash
# Install a release archive without Git. Never overwrite an existing checkout.
main() {
set -euo pipefail

version=v0.3.0
destination="${HOME:?HOME must be set}/.pi-workbench-ui"
register=true
usage() {
  printf '%s\n' 'Usage: bash install.sh [--version vX.Y.Z] [--dir /absolute/path] [--no-register]' \
    'Defaults: --version v0.3.0 --dir ~/.pi-workbench-ui' \
    'Requires Bash, curl, tar, Node.js 22.13+, GNU mv, and Pi (unless --no-register).' \
    'Existing directories and symlinks are never replaced.'
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
[[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'Version must be a release tag such as v0.3.0'
# Normalize trailing slashes so dangling symlinks are detected too.
while [[ "$destination" = */ ]]; do destination="${destination%/}"; done
[[ "$destination" = /* ]] && [ "$destination" != / ] || fail 'Installation directory must be an absolute path other than /'
[ ! -e "$destination" ] && [ ! -L "$destination" ] || fail "Already exists: $destination (move it aside before installing)"
for command in curl tar node mktemp mv; do command -v "$command" >/dev/null 2>&1 || fail "Required command not found: $command"; done
if "$register"; then command -v pi >/dev/null 2>&1 || fail 'Pi is not installed or not on PATH'; fi
node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(major<22 || (major===22 && minor<13)) process.exit(1)' || fail 'Node.js 22.13+ is required'
mv --version >/dev/null 2>&1 || fail 'GNU mv is required'
parent="$(dirname -- "$destination")"
mkdir -p -- "$parent"
staging="$(mktemp -d "$parent/.pi-workbench-ui-install.XXXXXX")"
trap 'rm -rf -- "$staging"' EXIT
printf 'Downloading pi-workbench-ui %s…\n' "$version"
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --tlsv1.2 \
  --retry 2 --connect-timeout 15 --max-time 120 \
  "https://github.com/itsomidho/pi-workbench-ui/archive/refs/tags/$version.tar.gz" \
  --output "$staging/package.tar.gz"
mkdir "$staging/package"
tar -xzf "$staging/package.tar.gz" --strip-components=1 --no-same-owner --no-same-permissions -C "$staging/package"
node - "$staging/package" "${version#v}" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const [directory, version] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
if (pkg.name !== 'pi-workbench-ui' || pkg.version !== version || !pkg.pi?.extensions?.includes('./index.ts')) {
  throw new Error('Unexpected package name, version or extension manifest');
}
for (const file of ['index.ts', 'settings.ts', 'ask.ts']) {
  const stat = fs.lstatSync(path.join(directory, file));
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Invalid package file: ${file}`);
}
NODE
# -n prevents a concurrent install from being overwritten; -T avoids nesting.
mv -T -n -- "$staging/package" "$destination"
[ ! -e "$staging/package" ] || fail "Destination appeared during installation: $destination"
printf 'Installed files at %s\n' "$destination"
if "$register"; then
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
