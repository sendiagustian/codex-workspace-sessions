// Builds a throwaway Codex home and workspace with invented sessions, so listing
// screenshots never carry real chat titles, project trees, or account quota.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const root = process.argv[2] ?? path.join(require('node:os').tmpdir(), 'codex-screenshot-demo');
const home = path.join(root, 'codex-home');
const workspace = path.join(root, 'demo-workspace');

const SESSIONS = [
  'Add dark mode toggle',
  'Fix login redirect loop',
  'Refactor the API client',
  'Speed up the image pipeline',
  'Write onboarding docs',
  'Migrate tests to the new runner',
];

const FILES = {
  'README.md': '# Demo Workspace\n\nSample project used only for documentation screenshots.\n',
  'package.json': JSON.stringify({ name: 'demo-workspace', version: '1.0.0', private: true }, null, 2) + '\n',
  'src/app.ts': 'export function start(): void {\n  console.log("demo");\n}\n',
  'src/theme.ts': 'export const themes = ["light", "dark"] as const;\n',
};

function usageEvent(stamp) {
  return {
    type: 'event_msg',
    timestamp: stamp,
    payload: {
      type: 'token_count',
      rate_limits: {
        limit_id: 'codex',
        primary: { used_percent: 42, window_minutes: 300, resets_at: Math.floor(Date.now() / 1000) + 9000 },
        secondary: { used_percent: 30, window_minutes: 10080, resets_at: Math.floor(Date.now() / 1000) + 380000 },
      },
    },
  };
}

function writeSession(title, index) {
  const id = randomUUID();
  const when = new Date(Date.now() - index * 3600_000);
  const stamp = when.toISOString();
  const folder = path.join(home, 'sessions', String(when.getFullYear()), String(when.getMonth() + 1).padStart(2, '0'), String(when.getDate()).padStart(2, '0'));
  fs.mkdirSync(folder, { recursive: true });
  const lines = [
    { type: 'session_meta', timestamp: stamp, payload: { id, cwd: workspace, timestamp: stamp } },
    { type: 'response_item', timestamp: stamp, payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: title }] } },
    usageEvent(stamp),
  ];
  fs.writeFileSync(path.join(folder, `rollout-${stamp.replace(/[:.]/g, '-')}-${id}.jsonl`), lines.map(line => JSON.stringify(line)).join('\n') + '\n');
  return { id, title, updated_at: stamp };
}

fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(workspace, { recursive: true });
for (const [name, body] of Object.entries(FILES)) {
  fs.mkdirSync(path.join(workspace, path.dirname(name)), { recursive: true });
  fs.writeFileSync(path.join(workspace, name), body);
}
const entries = SESSIONS.map(writeSession);
fs.writeFileSync(path.join(home, 'session_index.jsonl'), entries.map(entry => JSON.stringify({ id: entry.id, thread_name: entry.title, updated_at: entry.updated_at })).join('\n') + '\n');

console.log(`Codex home : ${home}`);
console.log(`Workspace  : ${workspace}`);
console.log(`Sessions   : ${entries.length}`);
