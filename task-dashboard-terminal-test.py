"""Real Pi usage dashboard modal, details, resize, close and export; no model calls."""
import fcntl, json, os, pathlib, pty, re, select, signal, struct, subprocess, tempfile, termios, time
root = pathlib.Path(__file__).resolve().parent
with tempfile.TemporaryDirectory(prefix='workbench-dashboard-pty-') as directory:
    create = '''
import { resolvePiRoot } from './test-support.mjs';
const { SessionManager } = await import(resolvePiRoot() + '/dist/index.js');
const sm = SessionManager.create(process.cwd(), process.env.FIXTURE_DIR);
sm.appendMessage({ role: 'user', content: [{ type: 'text', text: 'Dashboard fixture' }], timestamp: Date.now() });
sm.appendCustomEntry('workbench-task-usage', { action: 'start', id: 'dashboard-task-id', name: 'Dashboard 日本語', at: new Date(Date.now() - 90000).toISOString() });
sm.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'Dashboard fixture ready.' }], provider: 'fixture-provider', model: 'fixture-model', api: 'openai-responses', stopReason: 'stop', timestamp: Date.now(), usage: { input: 100, output: 100, cacheRead: 0, cacheWrite: 0, totalTokens: 200, cost: { input: .1, output: .155594, cacheRead: 0, cacheWrite: 0, total: .255594 } } });
console.log(sm.getSessionFile());
'''
    session = subprocess.check_output(['node', '--input-type=module', '-e', create], cwd=root, env=dict(os.environ, FIXTURE_DIR=directory), text=True).strip()
    master, slave = pty.openpty()
    def resize(columns, rows=40):
        fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', rows, columns, 0, 0))
    resize(100)
    process = subprocess.Popen(['pi', '--session', session, '--no-extensions', '--no-mcp', '--no-skills', '--no-prompt-templates', '--no-context-files', '-e', str(root / 'index.ts')], stdin=slave, stdout=slave, stderr=slave, env=dict(os.environ, TERM='xterm-256color', PI_WORKBENCH_UI_CONFIG=directory + '/ui.json', XDG_STATE_HOME=directory + '/state'))
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
        drain(4)
        os.write(master, b'/task-usage show\r'); text = drain(1)
        assert 'Task usage' in text and 'ACTIVE' in text and '$0.255594' in text and '50.0%' in text, text[-7000:]
        assert 'dashboard-task-id' not in text, text[-5000:]
        os.write(master, b'd'); text = drain(.5)
        assert 'dashboard-task-id' in text and 'Source:' in text, text[-5000:]
        os.write(master, b'd'); drain(.3)
        resize(40, 24); process.send_signal(signal.SIGWINCH); text = drain(.7)
        assert 'Task usage' in text and 'ACTIVE' in text, text[-5000:]
        os.write(master, b'\x1b[6~'); text = drain(.5)
        assert 'fixture-provider' in text or 'Cache read' in text, text[-5000:]
        os.write(master, b'\x1b'); drain(.5)
        os.write(master, b'/task-usage export\r'); drain(.8)
        files = list(pathlib.Path(directory, 'state/pi-workbench-ui/usage-reports').glob('*'))
        assert len(files) == 2, files
        data = json.loads(next(file for file in files if file.suffix == '.json').read_text())
        assert data['totals']['input'] == 100 and data['totals']['cost'] == .255594, data
        assert process.poll() is None
        print('PASS: real Pi dashboard status/usage bars, details, 40-column scrolling, Escape close and unchanged exports')
    finally:
        process.terminate()
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired: process.kill(); process.wait()
        os.close(master)
