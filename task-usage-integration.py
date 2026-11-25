"""Actual Pi RPC task boundary, reload, and private export test; no model calls."""
import json, os, pathlib, select, subprocess, tempfile, time
root = pathlib.Path(__file__).resolve().parent
with tempfile.TemporaryDirectory(prefix='task-usage-rpc-') as directory:
    env = dict(os.environ, XDG_STATE_HOME=directory + '/state', PI_WORKBENCH_UI_CONFIG=directory + '/ui.json')
    command = ['pi', '--mode', 'rpc', '--session-dir', directory + '/sessions', '--no-extensions', '--no-mcp', '--no-skills', '--no-prompt-templates', '--no-context-files', '-e', str(root / 'index.ts')]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    pending = bytearray()
    def request(identifier, **data):
        process.stdin.write((json.dumps(dict(id=identifier, **data)) + '\n').encode()); process.stdin.flush()
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if b'\n' not in pending:
                if not select.select([process.stdout], [], [], 1)[0]: continue
                chunk = os.read(process.stdout.fileno(), 65536)
                if not chunk: raise RuntimeError(process.stderr.read().decode())
                pending.extend(chunk)
            while b'\n' in pending:
                pos = pending.index(b'\n'); line = bytes(pending[:pos]); del pending[:pos + 1]
                event = json.loads(line)
                if event.get('id') == identifier and event.get('type') == 'response':
                    assert event.get('success'), event
                    return event
        raise TimeoutError(identifier)
    try:
        names = [item['name'] for item in request('commands', type='get_commands')['data']['commands']]
        assert 'task-usage' in names
        for number, message in enumerate(['/task-usage start Real task', '/ui set padding 2', '/task-usage finish', '/task-usage export']):
            request(str(number), type='prompt', message=message)
        reports = list(pathlib.Path(directory, 'state/pi-workbench-ui/usage-reports').glob('*'))
        assert len(reports) == 2, reports
        data = json.loads(next(p for p in reports if p.suffix == '.json').read_text())
        assert data['task'] == 'Real task' and data['status'] == 'finished', data
        assert data['turns'] == 0 and data['totals']['input'] is None, data
        assert all(p.stat().st_mode & 0o777 == 0o600 for p in reports)
        print('PASS: real Pi RPC saved-session start, reload, finish and private JSON/Markdown export')
    finally:
        process.terminate()
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired: process.kill(); process.wait()
