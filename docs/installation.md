# Installation and updates

Choose an archive installation (no Git), a dedicated Git checkout, or a Pi-managed Git package. Register only one copy to avoid duplicate extensions.

## Archive installation without Git

```sh
curl -fsSL https://raw.githubusercontent.com/itsomidho/pi-workbench-ui/main/install.sh | bash
```

The script defaults to the published `v0.6.0` archive and installs to `~/.pi-workbench-ui`. Prerequisites: Bash, curl, tar, Node.js 22.13+, GNU mv (Linux/coreutils), and Pi on PATH. It does not use Git, sudo, or npm. The installer checks the downloaded package name, version, manifest and required files; it does not provide an independent cryptographic signature check. Downloads rely on GitHub HTTPS.

To review the script before execution:

```sh
curl -fsSL https://raw.githubusercontent.com/itsomidho/pi-workbench-ui/main/install.sh -o /tmp/pi-workbench-ui-install.sh
less /tmp/pi-workbench-ui-install.sh
bash /tmp/pi-workbench-ui-install.sh --version v0.6.0
```

Options:

| Option | Purpose |
| --- | --- |
| `--version vX.Y.Z` | Download an existing release tag (v0.2.0 or later) |
| `--dir /absolute/path` | Override the installation directory |
| `--no-register` | Install files without running `pi install` |
| `--help` | Print usage |

For example, `bash /tmp/pi-workbench-ui-install.sh --dir "$HOME/.pi-workbench-ui" --no-register` installs files only. Register them later with `pi install ~/.pi-workbench-ui`. If registration fails, the script preserves the installation and prints a retry command. Temporary downloads are cleaned up automatically.

### Update an archive installation

Rerun the same curl command above. The installer validates the new archive before moving anything, backs up the old directory (including local edits) to a sibling `~/.pi-workbench-ui.backup.XXXXXX/previous`, and installs to the original path. It attempts to restore the backup if replacement fails and the destination is still free. Keep the backup until you have verified the update.

The same version is a no-op. Newer installs, Git checkouts, symlinks, and unrecognized directories are refused. Pi registration is not repeated on update; if the existing archive was never registered, run `pi install ~/.pi-workbench-ui` separately. When switching sources, use `pi list` and remove the old registration to avoid loading both copies. Settings and session history remain untouched. Archives have no `.git` directory, so `git pull` does not apply. Run `/reload` after installation or update.

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

To pin a release, install `git:github.com/itsomidho/pi-workbench-ui@v0.6.0`; updating reconciles that fixed ref rather than moving it to a newer release. To unregister, run `pi remove git:github.com/itsomidho/pi-workbench-ui` or use the exact source shown by `pi list`. Run `/reload` after changes.
