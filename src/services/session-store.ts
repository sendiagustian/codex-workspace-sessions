import { lstat, opendir, realpath } from 'node:fs/promises';
import * as path from 'node:path';
import { cleanLabel, matchesWorkspace, SESSION_ID, Session } from '../model/session';
import { UsageSnapshot } from '../model/usage';
import { parseRecord, record } from '../util/json';
import { missing, readPrefix } from './local-files';
import { readLatestUsage } from './usage-reader';

const MAX_FILES = 20000;
const MAX_ENTRIES = 50000;
const METADATA_BYTES = 256 * 1024;
const INDEX_BYTES = 8 * 1024 * 1024;
const ROLLOUT = /^rollout-.+-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;

interface Metadata { id: string; cwd: string; timestamp: number; started: boolean }
interface Cached { size: number; mtime: number; metadata: Metadata | undefined }
export interface ScanResult { sessions: Session[]; warnings: string[]; usage?: UsageSnapshot }

export class SessionStore {
  private readonly cache = new Map<string, Cached>();

  clear(): void { this.cache.clear(); }

  async scan(home: string, roots: readonly string[], descendants: boolean, signal?: AbortSignal): Promise<ScanResult> {
    signal?.throwIfAborted();
    if (roots.length === 0) return { sessions: [], warnings: [] };
    if (!path.isAbsolute(home)) throw new Error('Codex home must be an absolute directory.');
    let canonicalHome: string;
    try { canonicalHome = await realpath(home); }
    catch (error) {
      if (missing(error)) return { sessions: [], warnings: ['Codex home does not exist on this extension host.'] };
      throw error;
    }
    const warnings = new Set<string>();
    const files = await this.discover(canonicalHome, warnings, signal);
    const activeFiles = new Set(files);
    for (const file of this.cache.keys()) if (!activeFiles.has(file)) this.cache.delete(file);
    const sessions = new Map<string, Session>();
    for (const file of files) {
      signal?.throwIfAborted();
      try {
        const stat = await lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink()) continue;
        let cached = this.cache.get(file);
        if (!cached || cached.size !== stat.size || cached.mtime !== stat.mtimeMs) {
          cached = { size: stat.size, mtime: stat.mtimeMs, metadata: await this.metadata(file, canonicalHome, warnings) };
          signal?.throwIfAborted();
          this.cache.set(file, cached);
        }
        const meta = cached.metadata;
        if (!meta?.started) continue;
        const workspace = roots.find(root => matchesWorkspace(meta.cwd, root, descendants));
        if (!workspace) continue;
        const session = { ...meta, title: `Session ${meta.id.slice(0, 8)}`, updatedAt: Math.max(stat.mtimeMs, meta.timestamp), workspace };
        if ((sessions.get(meta.id)?.updatedAt ?? 0) <= session.updatedAt) sessions.set(meta.id, session);
      } catch (error) {
        if (!missing(error)) warnings.add('Some session files could not be read. Check file permissions.');
      }
    }
    signal?.throwIfAborted();
    await this.applyTitles(canonicalHome, sessions, warnings);
    signal?.throwIfAborted();
    const recentFiles = [...this.cache.entries()].filter(([, entry]) => entry.metadata).sort((a, b) => b[1].mtime - a[1].mtime).map(([file]) => file);
    let usage: UsageSnapshot | undefined;
    try { usage = await readLatestUsage(recentFiles, canonicalHome, signal); }
    catch { warnings.add('Saved usage could not be read. Refresh to try again.'); }
    signal?.throwIfAborted();
    return { sessions: [...sessions.values()], warnings: [...warnings], usage };
  }

  private async discover(home: string, warnings: Set<string>, signal?: AbortSignal): Promise<string[]> {
    const files: string[] = [];
    const queue = [{ directory: path.join(home, 'sessions'), depth: 0 }];
    let visited = 0;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      signal?.throwIfAborted();
      const item = queue[cursor];
      if (!item) continue;
      try {
        const stat = await lstat(item.directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
        const directory = await opendir(item.directory);
        for await (const entry of directory) {
          signal?.throwIfAborted();
          if (++visited > MAX_ENTRIES || files.length >= MAX_FILES) {
            warnings.add('Scan limit reached; some sessions are omitted. Use a smaller Codex home.');
            return files;
          }
          if (entry.isSymbolicLink()) continue;
          const fullPath = path.join(item.directory, entry.name);
          if (entry.isDirectory() && item.depth < 3 && /^\d{2,4}$/.test(entry.name)) queue.push({ directory: fullPath, depth: item.depth + 1 });
          else if (entry.isFile() && ROLLOUT.test(entry.name)) files.push(fullPath);
        }
      } catch (error) {
        if (!missing(error)) warnings.add('Some session directories could not be read. Check file permissions.');
      }
    }
    return files;
  }

  private async metadata(file: string, home: string, warnings: Set<string>): Promise<Metadata | undefined> {
    const prefix = await readPrefix(file, home, METADATA_BYTES);
    if (!prefix) return undefined;
    const newline = prefix.text.indexOf('\n');
    if (newline < 0 && prefix.truncated) {
      warnings.add('A session metadata header exceeds 256 KiB and was skipped.');
      return undefined;
    }
    const header = parseRecord(newline < 0 ? prefix.text : prefix.text.slice(0, newline));
    if (header?.type !== 'session_meta' || !record(header.payload)) return undefined;
    const { id, cwd, timestamp, source } = header.payload;
    if (typeof id !== 'string' || !SESSION_ID.test(id) || typeof cwd !== 'string' || cwd.length > 32768) return undefined;
    if (record(source) && 'subagent' in source) return undefined;
    if (ROLLOUT.exec(path.basename(file))?.[1]?.toLowerCase() !== id.toLowerCase()) return undefined;
    const date = typeof timestamp === 'string' ? Date.parse(timestamp) : 0;
    let started = hasUserMessage(prefix.text);
    if (!started && prefix.truncated) {
      const expanded = await readPrefix(file, home, INDEX_BYTES);
      started = expanded !== undefined && hasUserMessage(expanded.text);
      if (!started && expanded?.truncated) warnings.add('A session has no user message within the first 8 MiB and was omitted.');
    }
    return { id, cwd, timestamp: Number.isFinite(date) ? date : 0, started };
  }

  private async applyTitles(home: string, sessions: Map<string, Session>, warnings: Set<string>): Promise<void> {
    if (sessions.size === 0) return;
    try {
      const index = await readPrefix(path.join(home, 'session_index.jsonl'), home, INDEX_BYTES);
      if (!index) return;
      if (index.truncated) warnings.add('Title index exceeds 8 MiB; some titles may be outdated.');
      const lines = index.text.split('\n');
      if (index.truncated) lines.pop();
      for (const line of lines) {
        const value = parseRecord(line);
        if (typeof value?.id !== 'string' || typeof value.thread_name !== 'string') continue;
        const session = sessions.get(value.id);
        if (!session) continue;
        const title = cleanLabel(value.thread_name);
        if (title) session.title = title;
        const updated = typeof value.updated_at === 'string' ? Date.parse(value.updated_at) : 0;
        if (Number.isFinite(updated)) session.updatedAt = Math.max(session.updatedAt, updated);
      }
    } catch (error) {
      if (!missing(error)) warnings.add('Session titles could not be read. Check file permissions.');
    }
  }
}

function hasUserMessage(text: string): boolean {
  return text.split('\n').some(line => {
    if (!line.includes('user_message') && !line.includes('"role":"user"')) return false;
    const event = parseRecord(line);
    if (!event || !record(event.payload)) return false;
    if (event.type === 'event_msg') return event.payload.type === 'user_message';
    if (event.type === 'response_item') return event.payload.type === 'message' && event.payload.role === 'user';
    return false;
  });
}
