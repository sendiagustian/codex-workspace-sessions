import { open, lstat, realpath } from 'node:fs/promises';
import * as path from 'node:path';

export function missing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export async function readPrefix(file: string, root: string, limit: number): Promise<{ text: string; truncated: boolean } | undefined> {
  return readWindow(file, root, limit, false);
}

export async function readTail(file: string, root: string, limit: number): Promise<string | undefined> {
  const result = await readWindow(file, root, limit, true);
  if (!result) return undefined;
  const start = result.truncated ? result.text.indexOf('\n') + 1 : 0;
  const end = result.text.lastIndexOf('\n');
  return end < start || (result.truncated && start === 0) ? '' : result.text.slice(start, end);
}

async function readWindow(file: string, root: string, limit: number, fromEnd: boolean): Promise<{ text: string; truncated: boolean } | undefined> {
  const metadata = await lstat(file);
  if (!metadata.isFile() || metadata.isSymbolicLink()) return undefined;
  const resolved = await realpath(file);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) return undefined;
  const handle = await open(file, 'r');
  try {
    const current = await handle.stat();
    if (!current.isFile() || current.ino !== metadata.ino || current.dev !== metadata.dev) return undefined;
    const buffer = Buffer.alloc(Math.min(limit, current.size));
    const offset = fromEnd ? Math.max(0, current.size - limit) : 0;
    let position = 0;
    while (position < buffer.length) {
      const { bytesRead } = await handle.read(buffer, position, buffer.length - position, offset + position);
      if (bytesRead === 0) break;
      position += bytesRead;
    }
    return { text: buffer.subarray(0, position).toString('utf8'), truncated: current.size > position };
  } finally {
    await handle.close();
  }
}
