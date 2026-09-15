const { test } = require('node:test');
const assert = require('node:assert/strict');
const { matchesWorkspace, normalizeDirectory, cleanLabel, resumeCommand, selectSessions } = require('../dist/model/session');

test('Windows paths normalize drive case, separators and extended paths', () => {
  assert.equal(matchesWorkspace('\\\\?\\D:\\Work\\Project\\', 'd:/work/project', false, 'win32'), true);
  assert.equal(matchesWorkspace('\\\\?\\UNC\\server\\share\\project', '\\\\server\\share\\project', false, 'win32'), true);
  assert.equal(matchesWorkspace('D:\\work\\project-other', 'D:\\work\\project', true, 'win32'), false);
  assert.equal(matchesWorkspace('D:\\work\\project\\child', 'D:\\work\\project', false, 'win32'), false);
  assert.equal(matchesWorkspace('D:\\work\\project\\child', 'D:\\work\\project', true, 'win32'), true);
  assert.equal(matchesWorkspace('D:\\work', 'd:\\', true, 'win32'), true);
  assert.equal(normalizeDirectory('relative', 'win32'), undefined);
});

test('POSIX paths are case sensitive and honor directory boundaries', () => {
  assert.equal(matchesWorkspace('/work/app', '/work/app/', false, 'linux'), true);
  assert.equal(matchesWorkspace('/work/App', '/work/app', false, 'linux'), false);
  assert.equal(matchesWorkspace('/work/app2', '/work/app', true, 'linux'), false);
  assert.equal(matchesWorkspace('/work/app/sub', '/work/app', true, 'linux'), true);
  assert.equal(matchesWorkspace('/work', '/', true, 'linux'), true);
  assert.equal(matchesWorkspace('/work/app/../other', '/work/app', true, 'linux'), false);
  assert.equal(matchesWorkspace('relative', '/work', true, 'linux'), false);
});

test('labels remove control characters and command only accepts a UUID', () => {
  assert.equal(cleanLabel('Hello\n\u202Eworld'), 'Hello world');
  assert.equal(cleanLabel('x'.repeat(300)).length, 160);
  assert.throws(() => resumeCommand('id; curl attacker'), /Invalid/);
  assert.equal(resumeCommand('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'codex resume aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
});

test('search and pins sort without modifying source sessions', () => {
  const sessions = [{ id: 'a', title: 'Older session', updatedAt: 1 }, { id: 'b', title: 'New session', updatedAt: 2 }];
  assert.deepEqual(selectSessions(sessions, ['a'], '').map(s => s.id), ['a', 'b']);
  assert.deepEqual(selectSessions(sessions, [], 'NEW').map(s => s.id), ['b']);
  assert.deepEqual(sessions.map(s => s.id), ['a', 'b']);
});
