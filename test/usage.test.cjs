const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { parseUsage } = require('../dist/model/usage');
const { readLatestUsage } = require('../dist/services/usage-reader');
const { readTail } = require('../dist/services/local-files');
const { SessionStore } = require('../dist/services/session-store');
const { fixture, rollout } = require('./helpers/fixtures.cjs');
const { loadWithVscode, vscodeMock, Memento } = require('./helpers/vscode-mock.cjs');

const observedAt = '2026-09-14T10:00:00Z';
function event(percent = 0, overrides = {}) {
  return JSON.stringify({ type: 'event_msg', timestamp: observedAt, payload: { type: 'token_count', rate_limits: {
    limit_id: 'codex', primary: { used_percent: percent, window_minutes: 300, resets_at: 1789398000 },
    secondary: { used_percent: 33, window_minutes: 10080, resets_at: 1789800000 }, ...overrides,
  } } });
}

test('saved usage preserves zero, window durations and UTC reset timestamps', () => {
  const snapshot = parseUsage(event());
  assert.equal(snapshot.primary.usedPercent, 0);
  assert.equal(snapshot.primary.windowMinutes, 300);
  assert.equal(snapshot.primary.resetsAt, 1789398000000);
  assert.equal(snapshot.secondary.usedPercent, 33);
  assert.equal(snapshot.observedAt, Date.parse(observedAt));
});

test('missing, malformed and other model limits never become zero or overwrite Codex usage', () => {
  assert.equal(parseUsage(event(99, { limit_id: 'other-model' })), undefined);
  assert.equal(parseUsage('{broken'), undefined);
  assert.equal(parseUsage(event(20).replace('event_msg', 'response_item')), undefined);
  assert.equal(parseUsage(event(20, { primary: null, secondary: null })), undefined);
  assert.equal(parseUsage(event(20, { primary: { used_percent: -1, window_minutes: 300 }, secondary: null })), undefined);
  const snapshot = parseUsage(event(20, { primary: null }));
  assert.equal(snapshot.primary, undefined);
  assert.equal(snapshot.secondary.usedPercent, 33);
  assert.equal(parseUsage(event(10) + '\n' + event(99, { limit_id: 'other-model' })).primary.usedPercent, 10);
});

test('newest timestamp wins, including when lines are out of order', () => {
  const newer = event(25).replace(observedAt, '2026-09-14T11:00:00Z');
  assert.equal(parseUsage(newer + '\n' + event(10)).primary.usedPercent, 25);
});

test('bounded tails skip partial records and read past huge transcript bodies', async t => {
  const { home, project } = await fixture(t);
  const session = await rollout(home, project);
  await fs.appendFile(session.file, 'x'.repeat(2 * 1024 * 1024) + '\n' + event(12) + '\n{"incomplete":');
  const result = await readLatestUsage([session.file], await fs.realpath(home));
  assert.equal(result.primary.usedPercent, 12);
  const tail = await readTail(session.file, await fs.realpath(home), 1024);
  assert.equal(tail.includes('incomplete'), false);
  assert.equal(tail.startsWith('x'), false);
});

test('usage can come from another project without exposing its sessions or transcript', async t => {
  const { home, project } = await fixture(t);
  await rollout(home, project);
  const elsewhere = await rollout(home, project + '-other');
  await fs.appendFile(elsewhere.file, event(42) + '\n');
  const result = await new SessionStore().scan(home, [project], false);
  assert.equal(result.sessions.length, 1);
  assert.equal(result.usage.primary.usedPercent, 42);
  assert.equal(JSON.stringify(result).includes('MUST_NOT_BE_EXPOSED'), false);
  assert.equal(JSON.stringify(result).includes(project + '-other'), false);
});

test('usage reads reject paths outside home and stop after cancellation', async t => {
  const { home, project, base } = await fixture(t);
  const outside = await rollout(path.join(base, 'outside'), project);
  await fs.appendFile(outside.file, event(99) + '\n');
  assert.equal(await readLatestUsage([outside.file], await fs.realpath(home)), undefined);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(readLatestUsage([], home, abort.signal), { name: 'AbortError' });
});

test('a deleted recent rollout does not hide usage in other recent files', async t => {
  const { home, project } = await fixture(t);
  const session = await rollout(home, project);
  await fs.appendFile(session.file, event(10) + '\n');
  const snapshot = await readLatestUsage([path.join(home, 'missing.jsonl'), session.file], await fs.realpath(home));
  assert.equal(snapshot.primary.usedPercent, 10);
});

test('usage panel shows real percentages, expired resets, escaped text and no scripts', () => {
  const { mock } = vscodeMock('', '');
  const { usageHtml } = loadWithVscode(mock, '../dist/views/usage-view');
  const html = usageHtml(parseUsage(event()), '', Date.parse('2026-09-15T00:00:00Z'));
  assert.match(html, /Session \(5h\)/);
  assert.match(html, /Weekly \(7d\)/);
  assert.match(html, /value="0"/);
  assert.match(html, /value="33"/);
  assert.match(html, /Reset passed/);
  assert.match(html, /default-src 'none'/);
  assert.equal(html.includes('<script'), false);
  const empty = usageHtml(undefined, '<img src=x onerror=alert(1)>');
  assert.match(empty, /&lt;img/);
  assert.equal(empty.includes('<img'), false);
  assert.equal(empty.includes('<progress'), false);
});

test('a refresh paints usage once, so a saved snapshot never flashes before the account reply', async t => {
  const { home, project } = await fixture(t);
  const session = await rollout(home, project);
  await fs.appendFile(session.file, event(42) + '\n');
  const { mock } = vscodeMock(home, project);
  const { SessionController } = loadWithVscode(mock, '../dist/controller/session-controller');
  const controller = new SessionController(new Memento({ localAccess: true }), new Memento());
  t.after(() => controller.dispose());
  const disposable = { dispose() {} };
  const painted = [];
  const view = {
    visible: true,
    webview: { set html(value) { painted.push(value); }, get html() { return painted.at(-1) ?? ''; } },
    onDidChangeVisibility: () => disposable,
    onDidDispose: () => disposable,
  };
  controller.usage.resolveWebviewView(view);
  painted.length = 0;
  await controller.refresh();
  assert.equal(painted.length, 1);
  assert.match(painted[0], /value="42"/);
});

test('revoking access removes percentages from the usage webview', async t => {
  const { home, project } = await fixture(t);
  const session = await rollout(home, project);
  await fs.appendFile(session.file, event(42) + '\n');
  const { mock } = vscodeMock(home, project);
  const { SessionController } = loadWithVscode(mock, '../dist/controller/session-controller');
  const controller = new SessionController(new Memento({ localAccess: true }), new Memento());
  t.after(() => controller.dispose());
  const disposable = { dispose() {} };
  const view = { visible: true, webview: {}, onDidChangeVisibility: () => disposable, onDidDispose: () => disposable };
  controller.usage.resolveWebviewView(view);
  await controller.refresh();
  assert.match(view.webview.html, /value="42"/);
  assert.equal(view.webview.options.enableScripts, false);
  assert.deepEqual(view.webview.options.localResourceRoots, []);
  await controller.disable();
  assert.equal(view.webview.html.includes('value="42"'), false);
  assert.match(view.webview.html, /Enable Local Session Access/);
});
