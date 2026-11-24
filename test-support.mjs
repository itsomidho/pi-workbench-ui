import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export function resolvePiRoot() {
  if (process.env.PI_INSTALL_ROOT) return process.env.PI_INSTALL_ROOT;
  const require = createRequire(import.meta.url);
  let candidate;
  try {
    let directory = dirname(require.resolve('@earendil-works/pi-coding-agent'));
    while (dirname(directory) !== directory) {
      const manifest = join(directory, 'package.json');
      if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === '@earendil-works/pi-coding-agent') { candidate = directory; break; }
      directory = dirname(directory);
    }
  } catch { /* Fall back to the globally installed Pi used by the CLI. */ }
  if (!candidate) candidate = join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), '@earendil-works/pi-coding-agent');
  if (!existsSync(join(candidate, 'package.json'))) throw new Error('Install Pi or set PI_INSTALL_ROOT to its package directory.');
  return candidate;
}
