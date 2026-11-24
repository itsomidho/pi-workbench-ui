"""PTY smoke test only, not screenshot/visual certification."""
import fcntl, os, pathlib, pty, select, signal, struct, subprocess, tempfile, termios, time
with tempfile.TemporaryDirectory(prefix='workbench-ui-pty-') as directory:
    master, slave = pty.openpty()
    def resize(rows, columns):
        fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', rows, columns, 0, 0))
    resize(24, 80)
    process = subprocess.Popen(['pi', '--no-session', '--no-extensions', '--no-mcp', '--no-skills', '--no-prompt-templates', '--no-context-files', '-e', str(pathlib.Path(__file__).with_name('index.ts'))], stdin=slave, stdout=slave, stderr=slave, env=dict(os.environ, TERM='xterm-256color', PI_WORKBENCH_UI_CONFIG=directory + '/ui.json'))
    os.close(slave)
    output = bytearray()
    def drain(seconds):
        until = time.monotonic() + seconds
        while time.monotonic() < until:
            if select.select([master], [], [], 0.1)[0]:
                try:
                    output.extend(os.read(master, 65536))
                except OSError:
                    break
    try:
        drain(3)
        assert process.poll() is None, 'Pi exited during startup'
        os.write(master, 'typing 日本語 test'.encode())
        drain(0.5)
        for rows, columns in [(40, 120), (20, 40), (24, 80)]:
            resize(rows, columns)
            process.send_signal(signal.SIGWINCH)
            drain(0.5)
            assert process.poll() is None, 'Pi exited during resize'
        assert output, 'No terminal output'
        assert b'Extension error' not in output and b'TypeError:' not in output, output[-2000:]
        print('PASS: real Pi PTY startup, Unicode typing, 80/120/40-column resize; no model requests')
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        os.close(master)
