const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { SessionStore } = require('../dist/services/session-store');
const { readPrefix } = require('../dist/services/local-files');
const { fixture, rollout } = require('./fixtures.cjs');

test('only exact workspace sessions are shown; titles update; archives and subagents stay out', async t => {
  const { home, project } = await fixture(t);
  const main = await rollout(home, project);
  await rollout(home, project + '-other');
  await rollout(home, path.join(project, 'child'));
  await rollout(home, project, { archived: true });
  await rollout(home, project, { metadata: { source: { subagent: { thread_spawn: {} } } } });
  await fs.writeFile(path.join(home, 'auth.json'), 'PRIVATE_AUTH_DO_NOT_READ');
  await fs.writeFile(path.join(home, 'session_index.jsonl'), [
    JSON.stringify({ id: main.id, thread_name: 'Old title' }), '{broken',
    JSON.stringify({ id: main.id, thread_name: '<img src=x>\nNew title', updated_at: '2026-09-15T00:00:00Z' }),
  ].join('\n'));
  const before = await fs.readFile(main.file);
  const store = new SessionStore();
  const result = await store.scan(home, [project], false);
  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].title, '<img src=x> New title');
  assert.equal(JSON.stringify(result).includes('MUST_NOT_BE_EXPOSED'), false);
  assert.equal(JSON.stringify(result).includes('PRIVATE_AUTH'), false);
  assert.deepEqual(result.warnings, []);
  assert.equal((await store.scan(home, [project], true)).sessions.length, 2);
  assert.deepEqual(await fs.readFile(main.file), before);
  await fs.appendFile(path.join(home, 'session_index.jsonl'), '\n' + JSON.stringify({ id: main.id, thread_name: 'Renamed' }));
  assert.equal((await store.scan(home, [project], false)).sessions[0].title, 'Renamed');
  await fs.unlink(main.file);
  assert.equal((await store.scan(home, [project], false)).sessions.length, 0);
});

test('multi-root works and no folder means no storage access', async t => {
  const { home, project } = await fixture(t);
  await rollout(home, project);
  await rollout(home, project + '-other');
  const store = new SessionStore();
  assert.equal((await store.scan(home, [project, project + '-other'], false)).sessions.length, 2);
  assert.deepEqual(await store.scan('invalid-relative-home', [], false), { sessions: [], warnings: [] });
  await assert.rejects(store.scan('invalid-relative-home', [project], false), /absolute/);
  assert.match((await store.scan(home + '-missing', [project], false)).warnings[0], /does not exist/);
});

test('malformed, mismatched and oversized metadata do not produce sessions', async t => {
  const { home, project } = await fixture(t);
  await rollout(home, project, { raw: '{partial' });
  await rollout(home, project, { metadata: { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' } });
  await rollout(home, project, { raw: '{' + 'x'.repeat(300000) });
  const result = await new SessionStore().scan(home, [project], false);
  assert.equal(result.sessions.length, 0);
  assert.match(result.warnings.join(' '), /256 KiB/);
});

test('metadata cache detects a growing rollout and new session files', async t => {
  const { home, project } = await fixture(t);
  const session = await rollout(home, project);
  const store = new SessionStore();
  await store.scan(home, [project], false);
  await fs.appendFile(session.file, 'extra\n');
  await rollout(home, project);
  assert.equal((await store.scan(home, [project], false)).sessions.length, 2);
  store.clear();
  assert.equal((await store.scan(home, [project], false)).sessions.length, 2);
});

test('junctions outside storage are skipped and direct reads enforce containment', async t => {
  const { home, project, base } = await fixture(t);
  const outside = path.join(base, 'outside');
  const external = await rollout(outside, project);
  await fs.symlink(path.join(outside, 'sessions'), path.join(home, 'sessions'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await new SessionStore().scan(home, [project], false)).sessions.length, 0);
  assert.equal(await readPrefix(external.file, await fs.realpath(home), 1024), undefined);
});

test('oversized index is bounded and reports truncated titles', async t => {
  const { home, project } = await fixture(t);
  await rollout(home, project);
  await fs.writeFile(path.join(home, 'session_index.jsonl'), ' '.repeat(8 * 1024 * 1024 + 1));
  const result = await new SessionStore().scan(home, [project], false);
  assert.equal(result.sessions.length, 1);
  assert.match(result.warnings.join(' '), /8 MiB/);
});

test('cancelled scans stop and never return a stale result', async t => {
  const { home, project } = await fixture(t);
  await rollout(home, project);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(new SessionStore().scan(home, [project], false, abort.signal), { name: 'AbortError' });
});
