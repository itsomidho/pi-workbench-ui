import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const snapshotBytes = 1024 * 1024;
const previewBytes = 64 * 1024;
const previewRows = 400;
const maxFiles = 1000;
const conflicts = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);
export type Change = { path: string; from?: string; code: string; staged: boolean; unstaged: boolean; untracked: boolean; conflict: boolean };
export type WorkingTree = { root: string; changes: Change[]; omitted: number };

// Git output and filenames are data, not preformatted terminal text.
export const terminalText = (text: string) => text.replace(/\t/g, '    ').replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, '�');

function git(cwd: string, args: string[], limit: number, signal?: AbortSignal, allowTruncation = false): Promise<{ output: Buffer; truncated: boolean }> {
  return new Promise((ok, fail) => {
    execFile('git', ['--no-pager', '--literal-pathspecs', '-c', 'core.fsmonitor=false', ...args], {
      cwd, signal, encoding: 'buffer', timeout: 6000, maxBuffer: limit, windowsHide: true,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' },
    }, (error, stdout) => {
      if (!error) return ok({ output: stdout, truncated: false });
      if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
        if (allowTruncation) return ok({ output: stdout, truncated: true });
        return fail(new Error('Too many changes to display (Git status limit exceeded).'));
      }
      if (error.code === 'ENOENT') return fail(new Error('Git is not available.'));
      if (signal?.aborted) return fail(new Error('Cancelled.'));
      if (error.killed) return fail(new Error('Git took too long to respond.'));
      fail(new Error(args[0] === 'rev-parse' ? 'Not in a Git working tree.' : 'Git could not read the working tree.'));
    });
  });
}

export function parseStatus(output: Buffer): Pick<WorkingTree, 'changes' | 'omitted'> {
  if (output.length && output.at(-1) !== 0) throw new Error('Incomplete Git status output.');
  const records = output.toString('utf8').split('\0');
  const changes: Change[] = [];
  let omitted = 0;
  for (let i = 0; i < records.length - 1; i++) {
    const record = records[i];
    const code = record.slice(0, 2);
    const path = record.slice(3);
    if (!/^[ MADRCUT?!]{2}$/.test(code) || record[2] !== ' ' || !path) throw new Error('Unrecognized Git status output.');
    const from = /[RC]/.test(code) ? records[++i] : undefined; // porcelain -z: destination first, no arrows or quoting
    if (/[RC]/.test(code) && !from) throw new Error('Incomplete Git rename/copy record.');
    if (changes.length === maxFiles) { omitted++; continue; }
    const untracked = code === '??', conflict = conflicts.has(code);
    changes.push({ path, from, code, untracked, conflict, staged: !untracked && !conflict && code[0] !== ' ', unstaged: !untracked && !conflict && code[1] !== ' ' });
  }
  return { changes, omitted };
}

export async function readWorkingTree(cwd: string, signal?: AbortSignal): Promise<WorkingTree> {
  const result = await git(cwd, ['rev-parse', '--show-toplevel'], snapshotBytes, signal);
  const root = result.output.toString('utf8').replace(/\r?\n$/, '');
  if (!isAbsolute(root)) throw new Error('Git did not return an absolute worktree path.');
  const { output } = await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--find-renames'], snapshotBytes, signal);
  // Do not reinterpret invalid filename bytes or send replacement names back to Git.
  if (!Buffer.from(output.toString('utf8')).equals(output)) throw new Error('This worktree has filenames that cannot be displayed as UTF-8.');
  return { root, ...parseStatus(output) };
}

function previewText(output: Buffer, truncated: boolean, format?: (rows: string[]) => string[]) {
  const rows = output.toString('utf8').replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  const body = rows.slice(0, previewRows).map(terminalText);
  const shown = format ? format(body) : body;
  if (truncated || rows.length > previewRows) shown.push('… preview truncated (64 KiB / 400 lines per section)');
  return shown;
}

async function readUntracked(root: string, name: string, signal?: AbortSignal, format?: (rows: string[]) => string[]): Promise<string[]> {
  const heading = ['── Untracked file preview ──'];
  try {
    const base = await realpath(root);
    const path = resolve(base, name);
    const within = (p: string) => {
      const rel = relative(base, p);
      return !!rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
    };
    if (!within(path)) return [...heading, 'Preview skipped: path is outside the worktree.'];
    if (!(await lstat(path)).isFile() || !within(await realpath(path))) return [...heading, 'Preview skipped: not a regular file inside the worktree (symlinks are not followed).'];
    signal?.throwIfAborted();
    const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    try {
      const stat = await file.stat();
      if (!stat.isFile()) return [...heading, 'Preview skipped: file type changed.'];
      const buffer = Buffer.allocUnsafe(previewBytes + 1);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      signal?.throwIfAborted();
      const content = buffer.subarray(0, Math.min(bytesRead, previewBytes));
      const truncated = stat.size > bytesRead || bytesRead > previewBytes;
      if (content.includes(0)) return [...heading, 'Binary file; preview omitted.'];
      try { new TextDecoder('utf-8', { fatal: true }).decode(content, { stream: truncated }); }
      catch { return [...heading, 'Not valid UTF-8 text; preview omitted.']; }
      if (!bytesRead) return [...heading, '(empty file)'];
      return [...heading, ...previewText(content, truncated, format)];
    } finally { await file.close(); }
  } catch (error) {
    if (signal?.aborted) throw error;
    return [...heading, 'File is no longer readable. Refresh the changes list and try again.'];
  }
}

export async function readChangePreview(root: string, change: Change, signal?: AbortSignal, formatUntracked?: (rows: string[]) => string[]): Promise<string[]> {
  if (change.untracked) return readUntracked(root, change.path, signal, formatUntracked);
  const paths = change.from ? [change.from, change.path] : [change.path];
  const sections: Array<[string, string[]]> = change.conflict ? [['Conflict', ['--cc']]] : [
    ...(change.staged ? [['Staged', ['--cached']] as [string, string[]]] : []),
    ...(change.unstaged ? [['Unstaged', []] as [string, string[]]] : []),
  ];
  const rows: string[] = [];
  for (const [label, options] of sections) {
    if (rows.length) rows.push('');
    const { output, truncated } = await git(root, ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '--submodule=short', ...options, '--', ...paths], previewBytes, signal, true);
    rows.push(`── ${label} ──`, ...(output.length || truncated ? previewText(output, truncated) : ['(no textual diff; file status may have changed)']));
  }
  return rows.length ? rows : ['(no textual diff)'];
}
