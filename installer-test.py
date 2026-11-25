"""Offline installer tests: fake only download and Pi registration, use real tar/Node/mv."""
import io, json, os, pathlib, shutil, subprocess, tarfile, tempfile, unittest

SCRIPT = pathlib.Path(__file__).with_name('install.sh').resolve()

class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='workbench-installer-test-')
        self.root = pathlib.Path(self.temp.name)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.archive = self.root / 'release.tar.gz'
        self.dest = self.root / 'installed'
        self.log = self.root / 'calls'
        self.env = dict(os.environ, HOME=str(self.root), PATH=str(self.bin) + os.pathsep + os.environ['PATH'], ARCHIVE=str(self.archive), CALLS=str(self.log))
        self.fake('curl', '''#!/usr/bin/env bash
printf 'curl %s\\n' "$*" >> "$CALLS"
[ "${FAIL_CURL:-0}" = 0 ] || exit 22
while [ "$#" -gt 0 ]; do if [ "$1" = --output ]; then cp "$ARCHIVE" "$2"; exit; fi; shift; done
exit 2
''')
        self.fake('pi', '''#!/usr/bin/env bash
printf 'pi %s\\n' "$*" >> "$CALLS"
exit "${FAIL_PI:-0}"
''')
        self.make_archive()
    def tearDown(self):
        self.temp.cleanup()
    def fake(self, name, content):
        path = self.bin / name
        path.write_text(content)
        path.chmod(0o755)
    def make_archive(self, name='pi-workbench-ui', version='0.8.0', missing_prompt=False, missing_tokens=False, missing_task=None):
        files = {'package.json': json.dumps({'name': name, 'version': version, 'pi': {'extensions': ['./index.ts']}}), 'index.ts': '// test', 'settings.ts': '// test', 'ask.ts': '// test', 'prompt-borders.ts': '// test', 'token-usage.ts': '// test', 'task-usage.ts': '// test', 'task-dashboard.ts': '// test'}
        if missing_prompt:
            files.pop('prompt-borders.ts')
        if missing_tokens:
            files.pop('token-usage.ts')
        if missing_task:
            files.pop(missing_task)
        with tarfile.open(self.archive, 'w:gz') as archive:
            for name, value in files.items():
                data = value.encode()
                info = tarfile.TarInfo('package/' + name)
                info.size = len(data)
                archive.addfile(info, io.BytesIO(data))
    def run_install(self, *args, success=True, env=None):
        result = subprocess.run(['bash', str(SCRIPT), '--dir', str(self.dest), *args], env=dict(self.env, **(env or {})), text=True, capture_output=True, timeout=20)
        self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
        self.assertFalse(list(self.root.glob('.pi-workbench-ui-install.*')), 'temporary directory leaked')
        self.assertFalse(pathlib.Path(str(self.dest) + '.install-lock').exists(), 'installer lock leaked')
        return result
    def test_install_register_and_no_git(self):
        self.run_install()
        self.assertTrue((self.dest / 'index.ts').is_file())
        self.assertFalse((self.dest / '.git').exists())
        self.assertIn('pi install ' + str(self.dest), self.log.read_text())
        self.assertIn('/v0.8.0.tar.gz', self.log.read_text())
    def test_skip_registration(self):
        self.run_install('--no-register')
        self.assertNotIn('pi install', self.log.read_text())
    def test_default_destination(self):
        result = subprocess.run(['bash', str(SCRIPT), '--no-register'], env=self.env, capture_output=True, timeout=20)
        self.assertEqual(result.returncode, 0)
        self.assertTrue((self.root / '.pi-workbench-ui' / 'index.ts').is_file())
    def test_existing_directory_preserved(self):
        self.dest.mkdir()
        (self.dest / 'keep').write_text('original')
        self.run_install(success=False)
        self.assertEqual((self.dest / 'keep').read_text(), 'original')
        self.assertFalse(self.log.exists())
    def test_dangling_symlink_preserved(self):
        self.dest.symlink_to(self.root / 'missing')
        self.run_install('--dir', str(self.dest) + '/', success=False)
        self.assertTrue(self.dest.is_symlink())
    def test_invalid_arguments(self):
        for args in [('--version', '../main'), ('--version',), ('--wat',), ('--dir', '/'), ('--dir', 'relative')]:
            with self.subTest(args=args): self.run_install(*args, success=False)
        self.assertFalse(self.log.exists())
    def test_failed_download_leaves_no_install(self):
        self.run_install(success=False, env={'FAIL_CURL': '1'})
        self.assertFalse(self.dest.exists())
    def test_invalid_archive(self):
        self.archive.write_text('not an archive')
        self.run_install(success=False)
        self.assertFalse(self.dest.exists())
    def test_wrong_package_or_version(self):
        for name, version in [('other', '0.8.0'), ('pi-workbench-ui', '9.9.9')]:
            self.make_archive(name, version)
            self.run_install(success=False)
            self.assertFalse(self.dest.exists())
    def test_missing_prompt_module_rejected(self):
        self.make_archive(missing_prompt=True)
        self.run_install(success=False)
        self.assertFalse(self.dest.exists())
    def test_older_release_without_prompt_module(self):
        self.make_archive(version='0.3.0', missing_prompt=True)
        self.run_install('--version', 'v0.3.0')
        self.assertTrue((self.dest / 'index.ts').is_file())
    def seed_install(self, version='0.3.0'):
        self.make_archive(version=version, missing_prompt=version == '0.3.0')
        self.run_install('--version', 'v' + version, '--no-register')
        (self.dest / 'local-note').write_text('preserve me')
        self.log.unlink()
        self.make_archive()
    def test_upgrade_preserves_old_tree_and_skips_registration(self):
        self.seed_install()
        self.run_install(env={'FAIL_PI': '1'})
        self.assertEqual(json.loads((self.dest / 'package.json').read_text())['version'], '0.8.0')
        self.assertTrue((self.dest / 'prompt-borders.ts').is_file())
        backup, = self.root.glob('installed.backup.*')
        self.assertEqual((backup / 'previous/local-note').read_text(), 'preserve me')
        self.assertNotIn('pi install', self.log.read_text())
    def test_current_version_is_unchanged(self):
        self.seed_install('0.8.0')
        self.assertIn('already up to date', self.run_install().stdout)
        self.assertFalse(self.log.exists())
        self.assertEqual((self.dest / 'local-note').read_text(), 'preserve me')
    def test_newer_version_is_not_downgraded(self):
        self.seed_install('0.10.0')
        self.assertIn('refusing to downgrade', self.run_install(success=False).stderr)
        self.assertFalse(self.log.exists())
    def test_git_worktree_is_not_replaced(self):
        self.seed_install()
        (self.dest / '.git').write_text('gitdir: elsewhere')
        self.assertIn('Git checkout detected', self.run_install(success=False).stderr)
        self.assertFalse(self.log.exists())
    def test_bad_upgrade_archive_leaves_previous_install(self):
        self.seed_install()
        self.make_archive(missing_prompt=True)
        self.run_install(success=False)
        self.assertEqual((self.dest / 'local-note').read_text(), 'preserve me')
        self.assertFalse(list(self.root.glob('installed.backup.*')))
    def test_failed_replacement_restores_previous_install(self):
        self.seed_install()
        self.fake('mv', '''#!/usr/bin/env bash
for arg in "$@"; do case "$arg" in */.pi-workbench-ui-install.*/package) exit 1;; esac; done
exec "$REAL_MV" "$@"
''')
        result = self.run_install(success=False, env={'REAL_MV': shutil.which('mv')})
        self.assertIn('Restored previous installation', result.stderr)
        self.assertEqual((self.dest / 'local-note').read_text(), 'preserve me')
        self.assertFalse(list(self.root.glob('installed.backup.*')))
    def test_missing_token_module_rejected(self):
        self.make_archive(missing_tokens=True)
        self.run_install(success=False)
        self.assertFalse(self.dest.exists())
    def test_legacy_release_without_token_module(self):
        self.make_archive(version='0.6.0', missing_tokens=True)
        self.run_install('--version', 'v0.6.0')
        self.assertTrue((self.dest / 'index.ts').is_file())
    def test_missing_task_modules_rejected(self):
        for module in ['task-usage.ts', 'task-dashboard.ts']:
            with self.subTest(module=module):
                self.make_archive(missing_task=module)
                self.run_install(success=False)
                self.assertFalse(self.dest.exists())
    def test_previous_release_without_task_modules(self):
        self.make_archive(version='0.7.0', missing_task='task-dashboard.ts')
        self.run_install('--version', 'v0.7.0')
        self.assertTrue((self.dest / 'index.ts').is_file())
    def test_bad_task_upgrade_preserves_install(self):
        self.seed_install('0.7.0')
        self.make_archive(missing_task='task-usage.ts')
        self.run_install(success=False)
        self.assertEqual((self.dest / 'local-note').read_text(), 'preserve me')
        self.assertFalse(list(self.root.glob('installed.backup.*')))
    def test_registration_failure_preserves_files(self):
        result = self.run_install(success=False, env={'FAIL_PI': '1'})
        self.assertTrue((self.dest / 'index.ts').is_file())
        self.assertIn('Files were preserved', result.stderr)
    def test_path_with_spaces(self):
        self.dest = self.root / 'custom installation'
        self.run_install()
        self.assertTrue((self.dest / 'index.ts').is_file())

if __name__ == '__main__': unittest.main()
