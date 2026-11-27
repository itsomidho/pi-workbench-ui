"""Real Pi inline suggestions with a loopback mock provider; no external requests."""
import fcntl, http.server, json, os, pathlib, pty, re, select, struct, subprocess, tempfile, termios, threading, time

root = pathlib.Path(__file__).resolve().parent
requests = []
def suggestion_for(turn): return f'Check terminal result {turn}.'
class Provider(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_args): pass
    def do_POST(self):
        requests.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
        content = 'The terminal checks passed.\n\nSuggested next prompt: ' + suggestion_for(len(requests))
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.end_headers()
        for delta, finish in [({'role': 'assistant', 'content': content}, None), ({}, 'stop')]:
            data = dict(id='fixture', object='chat.completion.chunk', created=1, model='fixture', choices=[dict(index=0, delta=delta, finish_reason=finish)])
            self.wfile.write(('data: ' + json.dumps(data) + '\n\n').encode())
        self.wfile.write(b'data: [DONE]\n\n')

with tempfile.TemporaryDirectory(prefix='workbench-suggestions-') as directory, http.server.ThreadingHTTPServer(('127.0.0.1', 0), Provider) as server:
    threading.Thread(target=server.serve_forever, daemon=True).start()
    temp = pathlib.Path(directory)
    config = temp / 'ui.json'; config.write_text('{"promptSuggestions":true}')
    provider = temp / 'provider.ts'
    port = server.server_address[1]
    provider.write_text(f'''export default function(pi) {{
pi.registerProvider('suggestion-fixture', {{ baseUrl: 'http://127.0.0.1:{port}/v1', apiKey: 'fixture', api: 'openai-completions', models: [{{ id: 'fixture', name: 'Fixture', reasoning: false, input: ['text'], contextWindow: 32000, maxTokens: 512 }}] }});
}}''')
    master, slave = pty.openpty()
    fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', 32, 100, 0, 0))
    process = subprocess.Popen(['pi', '--no-session', '--no-extensions', '--no-mcp', '--no-skills', '--no-prompt-templates', '--no-context-files', '-e', str(root / 'index.ts'), '-e', str(provider), '--provider', 'suggestion-fixture', '--model', 'fixture'], stdin=slave, stdout=slave, stderr=slave, env=dict(os.environ, TERM='xterm-256color', PI_WORKBENCH_UI_CONFIG=str(config), PI_CODING_AGENT_DIR=str(temp / 'agent')))
    os.close(slave)
    def wait_for(needle, deadline=10, plain=False):
        output = bytearray(); until = time.monotonic() + deadline
        while time.monotonic() < until:
            if select.select([master], [], [], .1)[0]:
                try: output.extend(os.read(master, 65536))
                except OSError: break
                visible = re.sub(rb'\x1b\[[0-?]*[ -/]*[@-~]|\x1b_[^\x07]*\x07', b'', output) if plain else output
                if needle in visible: return output
        raise AssertionError((needle, output[-5000:]))
    try:
        wait_for(b'No tasks yet')
        os.write(master, b'What happened in the terminal?\r')
        wait_for((suggestion_for(1) + '  [→]').encode())
        assert len(requests) == 1, len(requests)
        assert 'Do not call a tool or start any additional work' in json.dumps(requests[0]['messages'])
        os.write(master, b'\r'); time.sleep(.25)
        assert len(requests) == 1, 'Enter submitted an unaccepted placeholder'
        os.write(master, b'My draft'); wait_for(b'My draft')
        os.write(master, b'\x1b[D\x1b[D\x1b[C\x1b[C'); time.sleep(.15)
        os.write(master, b'\t\r'); wait_for((suggestion_for(2) + '  [→]').encode())
        assert len(requests) == 2 and requests[1]['messages'][-1]['content'] == [{'type': 'text', 'text': 'My draft'}]
        os.write(master, b'\x1b[C'); wait_for(suggestion_for(2).encode())
        assert len(requests) == 2, 'Right Arrow submitted the suggestion'
        os.write(master, b'\r'); wait_for((suggestion_for(3) + '  [→]').encode())
        assert len(requests) == 3 and requests[2]['messages'][-1]['content'] == [{'type': 'text', 'text': suggestion_for(2)}]
        # Case mismatch distinguishes ghost text from the previously submitted transcript.
        os.write(master, b'wha'); wait_for(b'what happened in the terminal?', plain=True)
        assert len(requests) == 3, 'Typing the history prefix made a request'
        os.write(master, b'\x1b[C'); time.sleep(.2)
        assert len(requests) == 3, 'Right Arrow submitted the historical continuation'
        os.write(master, b' Again.\r'); wait_for((suggestion_for(4) + '  [→]').encode())
        assert len(requests) == 4 and requests[3]['messages'][-1]['content'] == [{'type': 'text', 'text': 'what happened in the terminal? Again.'}]
        print('PASS: real Pi inline next prompt and history suffix, editable Right Arrow insertion, normal draft keys and explicit Enter')
    finally:
        process.terminate()
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired: process.kill(); process.wait()
        os.close(master)
        server.shutdown()
