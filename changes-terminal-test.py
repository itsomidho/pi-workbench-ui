"""Real Pi working-tree overlay and navigation in an isolated Git repository."""
import fcntl, os, pathlib, pty, re, select, signal, struct, subprocess, tempfile, termios, time

root = pathlib.Path(__file__).resolve().parent
with tempfile.TemporaryDirectory(prefix='workbench-changes-pty-') as directory:
    sandbox = pathlib.Path(directory)
    repo = sandbox / 'repo'; repo.mkdir()
    env = dict(os.environ, TERM='xterm-256color', PI_WORKBENCH_UI_CONFIG=str(sandbox / 'ui.json'), PI_CODING_AGENT_DIR=str(sandbox / 'agent'), GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL='/dev/null')
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=repo, env=env, stderr=subprocess.PIPE)
    git('init', '-q')
    (repo / 'tracked.txt').write_text('original line\n')
    git('add', '--', 'tracked.txt'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture')
    (repo / 'tracked.txt').write_text('staged preview text\n'); git('add', '--', 'tracked.txt')
    (repo / 'tracked.txt').write_text('unstaged preview text\n')
    (repo / 'untracked.ts').write_text('export const untrackedPreview = 42;\n')
    index = (repo / '.git/index').read_bytes()
    master, slave = pty.openpty()
    def resize(rows, columns): fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', rows, columns, 0, 0))
    resize(40, 100)
    process = subprocess.Popen(['pi', '--no-session', '--no-extensions', '--no-mcp', '--no-skills', '--no-prompt-templates', '--no-context-files', '-e', str(root / 'index.ts')], cwd=repo, stdin=slave, stdout=slave, stderr=slave, env=env)
    os.close(slave)
    output = bytearray()
    def wait_for(needle, deadline=8):
        until = time.monotonic() + deadline
        while time.monotonic() < until:
            found = output.find(needle)
            if found >= 0:
                seen = bytes(output[:found + len(needle)])
                del output[:found + len(needle)]
                return seen
            if select.select([master], [], [], .1)[0]:
                try: output.extend(os.read(master, 65536))
                except OSError: break
        raise AssertionError((needle, output[-3000:]))
    try:
        wait_for(b'No tasks yet')
        os.write(master, b'/ui changes\r')
        wait_for(b'Working tree changes'); wait_for(b'1 staged'); wait_for(b'tracked.txt'); wait_for(b'untracked.ts')
        os.write(master, b'\r'); wait_for(b'+staged preview text'); wait_for(b'+unstaged preview text')
        os.write(master, b'\x1b'); wait_for(b'Enter preview')
        os.write(master, b'\x1b[B\r'); code = wait_for(b'untrackedPreview')
        assert re.search(rb'\x1b\[[0-9;]*mexport\x1b\[[0-9;]*m', code), 'TypeScript keyword is not syntax-highlighted'
        resize(24, 40); process.send_signal(signal.SIGWINCH)
        wait_for(b'Untracked file preview')
        os.write(master, b'\x1b'); wait_for(b'Enter view')
        (repo / 'added-after-open.txt').write_text('refresh fixture\n')
        os.write(master, b'r'); wait_for(b'added-after-open.txt')
        os.write(master, b'q'); time.sleep(.25)
        os.write(master, b'editor restored'); wait_for(b'editor restored')
        assert (repo / '.git/index').read_bytes() == index
        assert (repo / 'tracked.txt').read_text() == 'unstaged preview text\n'
        assert (repo / 'untracked.ts').read_text() == 'export const untrackedPreview = 42;\n'
        print('PASS: real Pi read-only Changes command, tracked diffs and syntax-highlighted untracked preview, 40-column resize and return to editor')
    finally:
        process.terminate()
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired: process.kill(); process.wait()
        os.close(master)
