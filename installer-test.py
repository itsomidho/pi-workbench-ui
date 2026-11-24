"""Offline installer tests: fake only download and Pi registration, use real tar/Node/mv."""
import io, json, os, pathlib, subprocess, tarfile, tempfile, unittest

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
    def make_archive(self, name='pi-workbench-ui', version='0.3.0'):
        files = {'package.json': json.dumps({'name': name, 'version': version, 'pi': {'extensions': ['./index.ts']}}), 'index.ts': '// test', 'settings.ts': '// test', 'ask.ts': '// test'}
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
        return result
    def test_install_register_and_no_git(self):
        self.run_install()
        self.assertTrue((self.dest / 'index.ts').is_file())
        self.assertFalse((self.dest / '.git').exists())
        self.assertIn('pi install ' + str(self.dest), self.log.read_text())
        self.assertIn('/v0.3.0.tar.gz', self.log.read_text())
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
        for name, version in [('other', '0.3.0'), ('pi-workbench-ui', '9.9.9')]:
            self.make_archive(name, version)
            self.run_install(success=False)
            self.assertFalse(self.dest.exists())
    def test_registration_failure_preserves_files(self):
        result = self.run_install(success=False, env={'FAIL_PI': '1'})
        self.assertTrue((self.dest / 'index.ts').is_file())
        self.assertIn('Files were preserved', result.stderr)
    def test_path_with_spaces(self):
        self.dest = self.root / 'custom installation'
        self.run_install()
        self.assertTrue((self.dest / 'index.ts').is_file())

if __name__ == '__main__': unittest.main()
