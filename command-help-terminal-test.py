"""Real Pi command palette: search, draft-only insertion, resize and Escape."""
import fcntl, os, pathlib, pty, select, signal, struct, subprocess, tempfile, termios, time

root = pathlib.Path(__file__).resolve().parent
with tempfile.TemporaryDirectory(prefix='workbench-command-help-') as directory:
    sandbox = pathlib.Path(directory)
    config = sandbox / 'ui.json'
    master, slave = pty.openpty()
    def resize(rows, columns): fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', rows, columns, 0, 0))
    resize(36, 110)
    process = subprocess.Popen(['pi', '--no-session', '--no-extensions', '--no-mcp', '--no-skills', '--no-prompt-templates', '--no-context-files', '-e', str(root / 'index.ts')], cwd=directory, stdin=slave, stdout=slave, stderr=slave, env=dict(os.environ, TERM='xterm-256color', PI_WORKBENCH_UI_CONFIG=str(config), PI_CODING_AGENT_DIR=str(sandbox / 'agent')))
    os.close(slave)
    output = bytearray()
    def wait_for(needle, deadline=8):
        until = time.monotonic() + deadline
        while time.monotonic() < until:
            found = output.find(needle)
            if found >= 0:
                del output[:found + len(needle)]
                return
            if select.select([master], [], [], .1)[0]:
                try: output.extend(os.read(master, 65536))
                except OSError: break
        raise AssertionError((needle, output[-3500:]))
    def show():
        os.write(master, b'/ui help\r'); wait_for(b'Workbench UI commands'); wait_for(b'Search:')
    try:
        wait_for(b'No tasks yet')
        show()
        os.write(master, b'reset'); wait_for(b'Search: reset'); wait_for(b'Disable the custom UI and reload Pi')
        os.write(master, b'\r'); wait_for(b'/ui reset'); time.sleep(.2)
        assert not config.exists(), 'Selecting reset unexpectedly executed it'
        os.write(master, b'\x15'); time.sleep(.2)
        show()
        os.write(master, b'usage start'); wait_for(b'/task-usage start <name>')
        os.write(master, b'\r'); time.sleep(.25)
        os.write(master, b'Example'); wait_for(b'/task-usage start Example')
        os.write(master, b'\x15'); time.sleep(.2)
        show()
        resize(24, 40); process.send_signal(signal.SIGWINCH)
        wait_for(b'Enter insert')
        os.write(master, b'\x1b'); time.sleep(.25)
        os.write(master, b'editor restored'); wait_for(b'editor restored')
        print('PASS: real Pi command palette search, draft-only insertion, no reset execution, resize and Escape')
    finally:
        process.terminate()
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired: process.kill(); process.wait()
        os.close(master)
