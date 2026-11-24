"""Real Pi RPC recovery/settings test. No model requests or user settings modified."""
import json, os, pathlib, selectors, subprocess, tempfile, time

with tempfile.TemporaryDirectory(prefix='workbench-ui-rpc-') as directory:
    config = pathlib.Path(directory) / 'ui.json'
    env = dict(os.environ, PI_WORKBENCH_UI_CONFIG=str(config))
    command = ['pi', '--mode', 'rpc', '--no-session', '--no-extensions', '--no-mcp', '--no-skills', '--no-prompt-templates', '--no-context-files', '-e', str(pathlib.Path(__file__).with_name('index.ts'))]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ)
    def request(identifier, **payload):
        process.stdin.write(json.dumps(dict(id=identifier, **payload)) + '\n')
        process.stdin.flush()
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if not selector.select(timeout=1):
                continue
            line = process.stdout.readline()
            if not line:
                raise RuntimeError('Pi exited: ' + process.stderr.read())
            event = json.loads(line)
            if event.get('type') == 'response' and event.get('id') == identifier:
                assert event.get('success'), event
                return event
        raise TimeoutError(identifier)
    try:
        result = request('commands', type='get_commands')
        names = [item['name'] for item in result['data']['commands']]
        assert 'ui' in names and 'todos' in names
        for index, prompt in enumerate(['/ui set padding 2', '/ui reset', '/ui enable']):
            request(str(index), type='prompt', message=prompt)
            saved = json.loads(config.read_text())
            assert saved['padding'] == 2
            assert saved['enabled'] == (index != 1)
        request('state', type='get_state')
        print('PASS: real Pi RPC load, /ui set + reload, reset + reload, enable + reload, persisted configuration')
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        selector.close()
