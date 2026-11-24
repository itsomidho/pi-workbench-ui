"""Exercise the Ask component through a real Pi custom screen, without a model."""
import fcntl, json, os, pathlib, pty, select, signal, struct, subprocess, tempfile, termios, time
root = pathlib.Path(__file__).resolve().parent
with tempfile.TemporaryDirectory(prefix='workbench-ask-') as directory:
    fixture = pathlib.Path(directory) / 'fixture.ts'
    marker = pathlib.Path(directory) / 'answer.json'
    fixture.write_text('import { AskBox } from ' + json.dumps(str(root / 'ask.ts')) + ';\nimport { writeFileSync } from "node:fs";\nexport default function(pi) { pi.registerCommand("ask-smoke", { handler: async (_args, ctx) => { const answer = await ctx.ui.custom((tui, theme, keys, done) => new AskBox({ question: "Ask smoke question", options: ["Keep", "Change"] }, tui, theme, keys, done), { blocked: { kind: "question", message: "Ask smoke question" } }); writeFileSync(' + json.dumps(str(marker)) + ', JSON.stringify(answer)); } }); }')
    master, slave = pty.openpty()
    def resize(columns):
        fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', 30, columns, 0, 0))
    resize(80)
    process = subprocess.Popen(['pi', '--no-session', '--no-extensions', '--no-mcp', '--no-skills', '--no-prompt-templates', '--no-context-files', '-e', str(root / 'index.ts'), '-e', str(fixture)], stdin=slave, stdout=slave, stderr=slave, env=dict(os.environ, TERM='xterm-256color', PI_WORKBENCH_UI_CONFIG=directory + '/ui.json'))
    os.close(slave)
    output = bytearray()
    def drain(seconds):
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            if select.select([master], [], [], .1)[0]:
                try: output.extend(os.read(master, 65536))
                except OSError: break
    try:
        drain(3)
        for mode in ['choice', 'cancel', 'other']:
            if marker.exists(): marker.unlink()
            os.write(master, b'/ask-smoke\r'); drain(.8)
            assert process.poll() is None
            resize(40); process.send_signal(signal.SIGWINCH); drain(.2)
            resize(100); process.send_signal(signal.SIGWINCH); drain(.2)
            if mode == 'choice': os.write(master, b'\x1b[B\r')
            elif mode == 'cancel': os.write(master, b'\x1b')
            else:
                os.write(master, b'\x1b[B\x1b[B\r'); drain(.2)
                os.write(master, b'My custom answer\r')
            drain(.8)
            assert marker.exists(), output[-2500:]
            answer = json.loads(marker.read_text())
            if mode == 'choice': assert answer['answer'] == 'Change', answer
            elif mode == 'cancel': assert answer['status'] == 'cancelled', answer
            else: assert answer['custom'] and answer['answer'] == 'My custom answer', answer
        print('PASS: real Pi Ask screen choice, Escape cancel, Other text entry, and 40/100-column resize')
    finally:
        process.terminate()
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired: process.kill(); process.wait()
        os.close(master)
