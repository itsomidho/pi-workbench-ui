# Installation and updates

Choose an archive installation (no Git), a dedicated Git checkout, or a Pi-managed Git package. Register only one copy to avoid duplicate extensions.

## Archive installation without Git

```sh
curl -fsSL https://raw.githubusercontent.com/itsomidho/pi-workbench-ui/main/install.sh | bash
```

The script defaults to the published `v0.4.0` archive and installs to `~/.pi-workbench-ui`. Prerequisites: Bash, curl, tar, Node.js 22.13+, GNU mv (Linux/coreutils), and Pi on PATH. It does not use Git, sudo, or npm. The installer checks the downloaded package name, version, manifest and required files; it does not provide an independent cryptographic signature check. Downloads rely on GitHub HTTPS.

To review the script before execution:

```sh
curl -fsSL https://raw.githubusercontent.com/itsomidho/pi-workbench-ui/main/install.sh -o /tmp/pi-workbench-ui-install.sh
less /tmp/pi-workbench-ui-install.sh
bash /tmp/pi-workbench-ui-install.sh --version v0.4.0
```

Options:

| Option | Purpose |
| --- | --- |
| `--version vX.Y.Z` | Download an existing release tag (v0.2.0 or later) |
| `--dir /absolute/path` | Override the installation directory |
| `--no-register` | Install files without running `pi install` |
| `--help` | Print usage |

For example, `bash /tmp/pi-workbench-ui-install.sh --dir "$HOME/.pi-workbench-ui" --no-register` installs files only. Register them later with `pi install ~/.pi-workbench-ui`. If registration fails, the script preserves the installation and prints a retry command. Temporary downloads are cleaned up automatically.

Existing directories, Git checkouts and symlinks are **never overwritten**. To update an archive installation or migrate an existing checkout, stop editing it and preserve it first:

```sh
backup="$HOME/.pi-workbench-ui.backup.$(date +%Y%m%d-%H%M%S)"
test ! -e "$backup" && test ! -L "$backup" && mv -T -n "$HOME/.pi-workbench-ui" "$backup"
# After confirming the backup succeeded, rerun the installer for the desired release.
bash /tmp/pi-workbench-ui-install.sh --version v0.4.0
```

Replace the version with the desired published tag. If installation fails, keep the backup; restore it only after inspecting any new destination. The installer does not migrate unrelated Pi package registrations: use `pi list` and remove the exact old registration when switching sources. Settings at `~/.config/pi-workbench/ui.json` and Pi session history remain untouched. Archives have no `.git` directory, so `git pull` does not apply. Run `/reload` after installation.

To unregister an archive install, run `pi remove ~/.pi-workbench-ui`. The files, settings and session history are preserved.

## Dedicated checkout

```sh
git clone https://github.com/itsomidho/pi-workbench-ui.git ~/.pi-workbench-ui
pi install ~/.pi-workbench-ui
pi list
```

Do not clone over an existing directory. To move from a development checkout, inspect `pi list`, remove the exact old registration with `pi remove <old-source>`, then install the dedicated checkout. Registration removal does not delete the old directory, settings or session history.

Update the dedicated checkout:

```sh
git -C ~/.pi-workbench-ui status --short
git -C ~/.pi-workbench-ui pull --ff-only
```

Resolve any local modifications or divergence before pulling. Run `/reload` in an existing Pi session. To unregister, run `pi remove ~/.pi-workbench-ui`; the checkout and settings remain.

## Pi-managed Git package

```sh
pi install git:github.com/itsomidho/pi-workbench-ui
pi update --extensions
```

To pin a release, install `git:github.com/itsomidho/pi-workbench-ui@v0.4.0`; updating reconciles that fixed ref rather than moving it to a newer release. To unregister, run `pi remove git:github.com/itsomidho/pi-workbench-ui` or use the exact source shown by `pi list`. Run `/reload` after changes.
