const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { fixture, rollout } = require('./fixtures.cjs');
const { loadWithVscode, Memento, vscodeMock } = require('./vscode-mock.cjs');

async function setup(t, enabled = true) {
  const files = await fixture(t);
  const session = await rollout(files.home, files.project);
  const env = vscodeMock(files.home, files.project);
  const { SessionController } = loadWithVscode(env.mock, '../dist/controller/session-controller');
  const globalState = new Memento({ localAccess: enabled });
  const workspaceState = new Memento();
  const controller = new SessionController(globalState, workspaceState);
  t.after(() => controller.dispose());
  return { ...files, ...env, session, controller, view: controller.view, globalState, workspaceState };
}

test('consent and workspace trust gate storage, including revocation during refresh', async t => {
  const { controller, view, mock } = await setup(t, false);
  await controller.refresh();
  assert.equal(controller.provider.getChildren().length, 0);
  assert.match(view.message, /disabled/);
  await controller.enable();
  assert.equal(controller.provider.getChildren().length, 1);
  const refresh = controller.refresh();
  await controller.disable();
  await refresh;
  assert.equal(controller.provider.getChildren().length, 0);
  mock.workspace.isTrusted = false;
  await controller.enable();
  assert.equal(controller.provider.getChildren().length, 0);
});

test('opening uses trusted session ID, original tab and verified editor; pin and copy work', async t => {
  const { controller, session, calls, workspaceState } = await setup(t);
  await controller.open(session.id);
  const open = calls.find(call => call[0] === 'vscode.openWith');
  assert.equal(open[1].path, `/local/${session.id}`);
  assert.equal(open[1].scheme, 'openai-codex');
  assert.equal(open[2], 'chatgpt.conversationEditor');
  assert.equal(open[3].preview, false);
  assert.equal(open[3].viewColumn, 2);
  assert.ok(calls.some(call => call[0] === 'workbench.action.lockEditorGroup'));
  await controller.pin({ id: session.id, cwd: '/attacker' });
  assert.deepEqual(workspaceState.get('pins'), [session.id]);
  await controller.copyResume(session.id);
  assert.equal(calls.find(call => call[0] === 'clipboard')[1], `codex resume ${session.id}`);
  const count = calls.length;
  await controller.open('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  assert.equal(calls.length, count);
});

test('subsequent and concurrent session clicks reuse the locked chat group', async t => {
  const { controller, session, calls, mock, home, project } = await setup(t);
  const second = await rollout(home, project);
  await Promise.all([controller.open(session.id), controller.open(second.id)]);
  await controller.open(session.id);
  assert.equal(calls.filter(call => /^workbench\.action\.newGroup(Left|Right)$/.test(call[0])).length, 1);
  assert.equal(mock.window.tabGroups.all.length, 2);
  assert.equal(mock.window.tabGroups.all[0].locked, undefined);
  assert.equal(mock.window.tabGroups.all[1].locked, true);
  assert.equal(mock.window.tabGroups.all[1].tabs.length, 2);
});

test('an existing mixed code and chat group is never locked', async t => {
  const { controller, session, mock } = await setup(t);
  const groups = mock.window.tabGroups;
  groups.all.push({ viewColumn: 2, tabs: [{ input: new mock.TabInputCustom({ path: '/local/other' }, 'chatgpt.conversationEditor') }, { input: { file: 'other.ts' } }] });
  await controller.open(session.id);
  assert.equal(groups.all[1].locked, undefined);
  assert.equal(groups.all[2].locked, true);
});

test('unknown versions, missing Codex, remote hosts and open failures show details', async t => {
  const { controller, session, calls, mock, settings } = await setup(t);
  mock.extensions.getExtension = () => ({ packageJSON: { version: '99.0.0' } });
  await controller.open(session.id);
  assert.equal(calls.at(-1)[0], 'details');
  mock.extensions.getExtension = () => undefined;
  await controller.open(session.id);
  assert.equal(calls.at(-1)[0], 'details');
  mock.extensions.getExtension = () => ({ packageJSON: { version: '26.908.40401' }, activate: async () => {} });
  mock.env.remoteName = 'ssh-remote';
  await controller.open(session.id);
  assert.equal(calls.at(-1)[0], 'details');
  mock.env.remoteName = undefined;
  settings.runCodexInWindowsSubsystemForLinux = true;
  await controller.open(session.id);
  assert.equal(calls.at(-1)[0], 'details');
  settings.runCodexInWindowsSubsystemForLinux = false;
  mock.commands.executeCommand = async () => { throw new Error('failed'); };
  await controller.open(session.id);
  assert.equal(calls.at(-1)[0], 'details');
});

test('workspace change during load cannot resurrect unrelated sessions', async t => {
  const { controller, mock, listeners, project } = await setup(t);
  const refresh = controller.refresh();
  mock.workspace.workspaceFolders = [{ uri: { scheme: 'file', fsPath: project + '-other' } }];
  listeners.folders();
  await refresh;
  assert.equal(controller.provider.getChildren().length, 0);
});

test('deleted sessions cannot be opened from stale tree entries, search clears visibly', async t => {
  const { controller, session, calls, view } = await setup(t);
  await controller.refresh();
  controller.filter('nothing matches');
  assert.equal(controller.provider.getChildren().length, 0);
  assert.match(view.message, /search/);
  controller.filter('');
  assert.equal(controller.provider.getChildren().length, 1);
  await fs.unlink(session.file);
  await controller.open(session.id);
  assert.equal(calls.length, 0);
});
