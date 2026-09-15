import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';

const ASSETS = path.join(__dirname, '..', '..', 'media', 'webview');
const cache = new Map<string, string>();

/** Reads a webview template or stylesheet from media/webview, caching it for the session. */
export function asset(...segments: readonly string[]): string {
  const key = segments.join('/');
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const text = readFileSync(path.join(ASSETS, ...segments), 'utf8').trim();
  cache.set(key, text);
  return text;
}

/** Replaces {{token}} placeholders. Inserted values are not rescanned. */
export function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (placeholder, key: string) => values[key] ?? placeholder);
}

export function createNonce(): string {
  return randomBytes(16).toString('hex');
}

export function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}
