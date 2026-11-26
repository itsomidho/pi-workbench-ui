"""Native Pi working labels with a loopback stream, one tool, and cancellation."""
import fcntl, http.server, json, os, pathlib, pty, re, select, struct, subprocess, tempfile, termios, threading, time

root = pathlib.Path(__file__).resolve().parent
allow_finish, cancel_stream = threading.Event(), threading.Event()
requests = []

class Provider(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_args): pass
    def do_POST(self):
        requests.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
        number = len(requests)
        if number == 3:
            cancel_stream.wait(12)
            return
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.end_headers()
        def emit(delta, finish=None):
            data = dict(id='fixture', object='chat.completion.chunk', created=1, model='fixture', choices=[dict(index=0, delta=delta, finish_reason=finish)])
            self.wfile.write(('data: ' + json.dumps(data) + '\n\n').encode())
            self.wfile.flush()
        try:
            if number == 1:
                emit({'role': 'assistant', 'tool_calls': [
                    {'index': 0, 'id': 'call_title', 'type': 'function', 'function': {'name': 'ui_title', 'arguments': json.dumps(dict(tool='check_fixture', description='Checking fixture from title'))}},
                    {'index': 1, 'id': 'call_check', 'type': 'function', 'function': {'name': 'check_fixture', 'arguments': '{}'}},
                ]})
                emit({}, 'tool_calls')
            else:
                emit({'role': 'assistant', 'content': 'Fixture reply.'})
                allow_finish.wait(12)
                emit({}, 'stop')
            self.wfile.write(b'data: [DONE]\n\n')
        except (BrokenPipeError, ConnectionResetError):
            pass

with tempfile.TemporaryDirectory(prefix='workbench-activity-') as directory, http.server.ThreadingHTTPServer(('127.0.0.1', 0), Provider) as server:
    threading.Thread(target=server.serve_forever, daemon=True).start()
    temp = pathlib.Path(directory)
    (temp / 'ui.json').write_text('{"activityChars":true}')
    provider = temp / 'provider.ts'
    port = server.server_address[1]
    provider.write_text(f'''export default function(pi) {{
      pi.registerProvider('status-fixture', {{ baseUrl: 'http://127.0.0.1:{port}/v1', apiKey: 'fixture', api: 'openai-completions', models: [{{ id: 'fixture', name: 'Fixture', reasoning: false, input: ['text'], contextWindow: 32000, maxTokens: 512 }}] }});
      pi.registerTool({{ name: 'check_fixture', label: 'Fixture check', description: 'Check fixture', parameters: {{ type: 'object', properties: {{}} }}, async execute() {{
        await new Promise(resolve => setTimeout(resolve, 1000));
        return {{ content: [{{ type: 'text', text: 'Checked' }}], details: {{}} }};
      }} }});
      pi.on('agent_settled', (event, ctx) => ctx.ui.notify(event.aborted ? 'Fixture cancelled' : 'Fixture settled', 'info'));
    }}''')
    master, slave = pty.openpty()
    fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', 32, 100, 0, 0))
    process = subprocess.Popen(['pi', '--no-session', '--no-extensions', '--no-mcp', '--no-skills', '--no-prompt-templates', '--no-context-files', '-e', str(root / 'index.ts'), '-e', str(provider), '--provider', 'status-fixture', '--model', 'fixture'], stdin=slave, stdout=slave, stderr=slave, env=dict(os.environ, TERM='xterm-256color', PI_WORKBENCH_UI_CONFIG=str(temp / 'ui.json'), PI_CODING_AGENT_DIR=str(temp / 'agent')))
    os.close(slave)
    pending = bytearray()
    def wait_for(needle):
        until = time.monotonic() + 10
        while time.monotonic() < until:
            found = pending.find(needle)
            if found >= 0:
                del pending[:found + len(needle)]
                return
            if select.select([master], [], [], .1)[0]:
                try: pending.extend(os.read(master, 65536))
                except OSError: break
        raise AssertionError((needle, pending[-5000:]))
    try:
        wait_for(b'No tasks yet')
        os.write(master, b'Run the fixture check.\r')
        wait_for(b'Waiting for model')
        # The label also appears in ui_title arguments; check the editor border.
        pattern = re.compile(r'── [^\r\n]{1,8}Checking fixture from title ─')
        until = time.monotonic() + 10
        while time.monotonic() < until:
            plain = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', pending.decode(errors='replace'))
            if pattern.search(plain): break
            if select.select([master], [], [], .1)[0]: pending.extend(os.read(master, 65536))
        else: raise AssertionError(plain[-5000:])
        wait_for('Writing reply · 14 chars'.encode())
        allow_finish.set()
        wait_for(b'Fixture settled')
        assert len(requests) == 2
        os.write(master, b'Start a request to cancel.\r')
        wait_for(b'Waiting for model')
        os.write(master, b'\x1b')
        wait_for(b'Fixture cancelled')
        os.write(master, b'/ui settings\r')
        wait_for(b'"activityStatus": true')
        print('PASS: real Pi native spinner renders waiting, tool and counted writing labels; Escape cancels and returns to idle')
    finally:
        allow_finish.set(); cancel_stream.set()
        process.terminate()
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired: process.kill(); process.wait()
        os.close(master)
        server.shutdown()
