import * as path from 'node:path';

export interface Session {
  id: string;
  title: string;
  cwd: string;
  updatedAt: number;
  workspace: string;
}

export const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strips control characters so session-authored titles stay safe as plain text. */
export function cleanLabel(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
}

export function normalizeDirectory(value: string, platform: NodeJS.Platform = process.platform): string | undefined {
  if (platform === 'win32') {
    let normalized = value.replace(/\//g, '\\');
    if (normalized.startsWith('\\\\?\\UNC\\')) normalized = '\\\\' + normalized.slice(8);
    else if (normalized.startsWith('\\\\?\\')) normalized = normalized.slice(4);
    if (!/^(?:[a-z]:\\|\\\\[^\\]+\\[^\\]+)/i.test(normalized)) return undefined;
    return path.win32.normalize(normalized).replace(/\\+$/, '').toLowerCase();
  }
  if (!path.posix.isAbsolute(value)) return undefined;
  return path.posix.normalize(value).replace(/\/+$/, '') || '/';
}

export function matchesWorkspace(cwd: string, root: string, descendants = false, platform: NodeJS.Platform = process.platform): boolean {
  const candidate = normalizeDirectory(cwd, platform);
  const workspace = normalizeDirectory(root, platform);
  if (candidate === undefined || workspace === undefined) return false;
  if (candidate === workspace) return true;
  const separator = platform === 'win32' ? '\\' : '/';
  return descendants && candidate.startsWith(workspace.endsWith(separator) ? workspace : workspace + separator);
}

export function resumeCommand(id: string): string {
  if (!SESSION_ID.test(id)) throw new Error('Invalid session ID.');
  return `codex resume ${id}`;
}

/** Orders sessions for the sidebar: pinned first, then most recent activity. */
export function selectSessions(sessions: readonly Session[], pins: readonly string[], query: string): Session[] {
  const pinned = new Set(pins);
  const search = query.trim().toLowerCase();
  return sessions.filter(session => `${session.title} ${session.id}`.toLowerCase().includes(search))
    .sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)) || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}
