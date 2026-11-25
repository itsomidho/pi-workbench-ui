"""Real Pi TODO scroll shortcuts and editor isolation; no model requests."""
import fcntl, json, os, pathlib, pty, re, select, signal, struct, subprocess, tempfile, termios, time
root = pathlib.Path(__file__).resolve().parent
with tempfile.TemporaryDirectory(prefix='workbench-todo-pty-') as directory:
    create = '''
import { resolvePiRoot } from './test-support.mjs';
const { SessionManager } = await import(resolvePiRoot() + '/dist/index.js');
const sm = SessionManager.create(process.cwd(), process.env.FIXTURE_DIR);
sm.appendMessage({ role: 'user', content: [{ type: 'text', text: 'Older saved prompt' }], timestamp: Date.now() });
sm.appendMessage({ role: 'user', content: [{ type: 'text', text: 'Newest saved prompt' }], timestamp: Date.now() });
sm.appendCustomEntry('workbench-plan', { title: 'Scroll fixture', items: Array.from({ length: 9 }, (_, i) => ({ text: 'Task ' + (i + 1), status: i === 6 ? 'in_progress' : 'pending' })) });
console.log(sm.getSessionFile());
'''
    session = subprocess.check_output(['node', '--input-type=module', '-e', create], cwd=root, env=dict(os.environ, FIXTURE_DIR=directory), text=True).strip()
    master, slave = pty.openpty()
    def resize(columns):
        fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', 30, columns, 0, 0))
    resize(100)
    process = subprocess.Popen(['pi', '--session', session, '--no-extensions', '--no-mcp', '--no-skills', '--no-prompt-templates', '--no-context-files', '-e', str(root / 'index.ts')], stdin=slave, stdout=slave, stderr=slave, env=dict(os.environ, TERM='xterm-256color', PI_WORKBENCH_UI_CONFIG=directory + '/ui.json'))
    os.close(slave)
    def drain(seconds):
        output = bytearray(); until = time.monotonic() + seconds
        while time.monotonic() < until:
            if select.select([master], [], [], .1)[0]:
                try: output.extend(os.read(master, 65536))
                except OSError: break
        text = output.decode('utf8', errors='replace')
        text = re.sub(r'\x1b\][^\x07]*(?:\x07|\x1b\\)', '', text)
        return re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', text)
    try:
        text = drain(4)
        assert '5–8 of 9' in text and 'following' in text, text[-5000:]
        os.write(master, b'/reload\r'); text = drain(1.5)
        assert 'Reloaded keybindings' in text, text[-5000:]
        os.write(master, b'\x1b[A'); text = drain(.6)
        assert 'Newest saved prompt' in text, text[-5000:]
        os.write(master, b'\x1b[A'); text = drain(.6)
        assert 'Older saved prompt' in text, text[-5000:]
        os.write(master, b'\x1b[B'); text = drain(.6)
        assert 'Newest saved prompt' in text, text[-5000:]
        os.write(master, b'\x03'); drain(.5)
        # Xterm modifier 7 = Ctrl+Alt. Plain arrows remain editor/history keys.
        os.write(master, b'\x1b[1;7A'); text = drain(.7)
        assert '4–7 of 9' in text and '/todos follow' in text, text[-5000:]
        os.write(master, b'\x1b[1;7B'); text = drain(.7)
        assert '5–8 of 9' in text, text[-5000:]
        os.write(master, b'/todos follow\r'); text = drain(.8)
        assert 'following' in text, text[-5000:]
        os.write(master, 'draft 日本語'.encode()); drain(.5)
        resize(40); process.send_signal(signal.SIGWINCH); text = drain(.7)
        assert 'draft 日本語' in text and '5–8 of 9' in text, text[-5000:]
        assert process.poll() is None and 'TypeError:' not in text
        print('PASS: real Pi prompt history after reload, TODO Ctrl+Alt+arrows, follow command, draft typing and 40-column resize')
    finally:
        process.terminate()
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired: process.kill(); process.wait()
        os.close(master)
