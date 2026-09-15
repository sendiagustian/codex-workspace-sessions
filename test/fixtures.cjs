const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-sessions-test-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const home = path.join(base, 'home');
  const project = path.join(base, 'project');
  await fs.mkdir(home);
  await fs.mkdir(project);
  return { base, home, project };
}

async function rollout(home, cwd, options = {}) {
  const id = options.id ?? randomUUID();
  const folder = path.join(home, options.archived ? 'archived_sessions' : 'sessions', '2026', '09', '14');
  await fs.mkdir(folder, { recursive: true });
  const file = path.join(folder, `rollout-2026-09-14T10-00-00-${id}.jsonl`);
  const header = { type: 'session_meta', payload: { id, cwd, timestamp: '2026-09-14T10:00:00Z', source: 'vscode', ...options.metadata } };
  await fs.writeFile(file, options.raw ?? JSON.stringify(header) + '\n' + JSON.stringify({ type: 'event_msg', payload: { type: options.draft ? 'task_started' : 'user_message', message: 'MUST_NOT_BE_EXPOSED' } }) + '\n');
  return { id, file };
}

module.exports = { fixture, rollout };
