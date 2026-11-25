"""Resume a real Pi session fixture and verify usage labels without model calls."""
import fcntl, json, os, pathlib, pty, re, select, struct, subprocess, tempfile, termios, time
root = pathlib.Path(__file__).resolve().parent
with tempfile.TemporaryDirectory(prefix='workbench-token-pty-') as directory:
    # Use Pi's own writer, not a hand-crafted session schema.
    create = '''
import { resolvePiRoot } from './test-support.mjs';
const { SessionManager } = await import(resolvePiRoot() + '/dist/index.js');
const sm = SessionManager.create(process.cwd(), process.env.FIXTURE_DIR);
const usage = { input: 1200, output: 320, cacheRead: 4000, cacheWrite: 200, totalTokens: 5720, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
sm.appendMessage({ role: 'user', content: [{ type: 'text', text: 'Token usage resume fixture' }], timestamp: Date.now() });
sm.appendMessage({ role: 'assistant', content: ['one','two'].map(id => ({ type: 'toolCall', id, name: 'read', arguments: { path: 'fixture.txt' } })), usage, model: 'fixture-model', provider: 'fixture-provider', api: 'openai-responses', stopReason: 'toolUse', timestamp: Date.now() });
for (const id of ['one','two']) sm.appendMessage({ role: 'toolResult', toolCallId: id, toolName: 'read', content: [{ type: 'text', text: 'Fixture result' }], isError: false, timestamp: Date.now(), ...(id === 'two' ? { usage: { ...usage, input: 20, output: 8, cacheRead: 0, cacheWrite: 0, totalTokens: 28 } } : {}) });
console.log(sm.getSessionFile());
'''
    session = subprocess.check_output(['node', '--input-type=module', '-e', create], cwd=root, env=dict(os.environ, FIXTURE_DIR=directory), text=True).strip()
    master, slave = pty.openpty()
    fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', 45, 160, 0, 0))
    process = subprocess.Popen(['pi', '--session', session, '--no-extensions', '--no-mcp', '--no-skills', '--no-prompt-templates', '--no-context-files', '-e', str(root / 'index.ts')], stdin=slave, stdout=slave, stderr=slave, env=dict(os.environ, TERM='xterm-256color', PI_WORKBENCH_UI_CONFIG=directory + '/ui.json'))
    os.close(slave)
    output = bytearray()
    try:
        end = time.monotonic() + 5
        while time.monotonic() < end:
            if select.select([master], [], [], .1)[0]:
                try: output.extend(os.read(master, 65536))
                except OSError: break
        assert process.poll() is None, output[-3000:]
        text = output.decode('utf8', errors='replace')
        text = re.sub(r'\x1b\][^\x07]*(?:\x07|\x1b\\)', '', text)
        text = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', text)
        assert text.count('shared turn:') >= 2, text[-6000:]
        assert '↑1.2k ↓320 R4.0k W200' in text, text[-6000:]
        assert 'tool model: ↑20 ↓8' in text, text[-6000:]
        print('PASS: real Pi resume renders shared sibling-turn usage and separate tool-reported model usage')
    finally:
        process.terminate()
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired: process.kill(); process.wait()
        os.close(master)
