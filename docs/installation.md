# Installation and updates

Pi supports a managed Git package or a dedicated checkout. Choose one; installing both can register duplicate extensions.

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

To pin a release, install `git:github.com/itsomidho/pi-workbench-ui@v0.1.1`; updating reconciles that fixed ref rather than moving it to a newer release. To unregister, run `pi remove git:github.com/itsomidho/pi-workbench-ui` or use the exact source shown by `pi list`. Run `/reload` after changes.
