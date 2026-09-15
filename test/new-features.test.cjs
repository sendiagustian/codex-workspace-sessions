const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { fixture, rollout } = require('./fixtures.cjs');
const { loadWithVscode, vscodeMock, Memento } = require('./vscode-mock.cjs');
const { SessionStore } = require('../dist/services/session-store');
const { parseAccountUsage } = require('../dist/model/usage');

test('a draft becomes visible only after a user message, including after a long preamble', async t => {
  const { home, project } = await fixture(t);
  const draft = await rollout(home, project, { draft: true });
  const store = new SessionStore();
  assert.equal((await store.scan(home, [project], false)).sessions.length, 0);
  await fs.appendFile(draft.file, JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'developer', content: 'environment context' } }) + '\n');
  assert.equal((await store.scan(home, [project], false)).sessions.length, 0);
  await fs.appendFile(draft.file, JSON.stringify({ type: 'response_item', payload: { content: 'x'.repeat(300000) } }) + '\n');
  await fs.appendFile(draft.file, JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: 'Hello' } }) + '\n');
  assert.equal((await store.scan(home, [project], false)).sessions[0].id, draft.id);
  assert.equal((await store.scan(home, [project + '-other'], false)).sessions.length, 0);
});

test('new chat opens the native draft in a locked split, without inventing a session', async t => {
  const { home, project } = await fixture(t);
  const { mock, calls } = vscodeMock(home, project);
  const { SessionController } = loadWithVscode(mock, '../dist/controller/session-controller');
  const controller = new SessionController(new Memento({ localAccess: true }), new Memento());
  t.after(() => controller.dispose());
  await controller.newSession();
  await controller.newSession();
  assert.equal(controller.provider.getChildren().length, 0);
  assert.equal(calls.filter(call => /^workbench\.action\.newGroup(Left|Right)$/.test(call[0])).length, 1);
  assert.equal(calls.find(call => call[0] === 'vscode.openWith')[1].path, '/extension/panel/new');
  assert.ok(calls.some(call => call[0] === 'workbench.action.lockEditorGroup'));
  calls.length = 0;
  mock.workspace.workspaceFolders = [];
  await controller.newSession();
  assert.equal(calls.length, 0);
});

test('the chat group splits toward the side the primary sidebar is on', async t => {
  const { home, project } = await fixture(t);
  const session = await rollout(home, project);
  const split = async settings => {
    const context = vscodeMock(home, project);
    Object.assign(context.settings, settings);
    const { SessionController } = loadWithVscode(context.mock, '../dist/controller/session-controller');
    const controller = new SessionController(new Memento({ localAccess: true }), new Memento());
    t.after(() => controller.dispose());
    await controller.open(session.id);
    return context.calls.find(call => /^workbench\.action\.newGroup(Left|Right)$/.test(call[0]))?.[0];
  };
  assert.equal(await split({ 'sideBar.location': 'right' }), 'workbench.action.newGroupRight');
  assert.equal(await split({ 'sideBar.location': 'left' }), 'workbench.action.newGroupLeft');
  assert.equal(await split({}), 'workbench.action.newGroupLeft', 'VS Code defaults the sidebar to the left');
});

test('sidebar search focuses the view without a popup; webview rejects arbitrary actions and IDs', async t => {
  const { home, project } = await fixture(t);
  const { mock, calls } = vscodeMock(home, project);
  mock.window.showInputBox = () => { throw new Error('Search must not use a popup'); };
  const { SessionView } = loadWithVscode(mock, '../dist/views/session-view');
  const provider = new SessionView(mock.Uri.file(home));
  t.after(() => provider.dispose());
  const session = await rollout(home, project);
  provider.update([{ ...session, title: '<script>bad()</script>' }], []);
  let receive;
  const posted = [];
  const disposable = { dispose() {} };
  const view = { visible: true, webview: {
    asWebviewUri: () => ({ toString: () => 'https://local.invalid/sessions.js' }),
    onDidReceiveMessage: callback => { receive = callback; return disposable; },
    postMessage: async message => posted.push(message),
  }, onDidChangeVisibility: () => disposable, onDidDispose: () => disposable };
  provider.resolveWebviewView(view);
  receive({ type: 'ready' });
  assert.equal(posted[0].sessions[0].title, '<script>bad()</script>');
  assert.equal(view.webview.html.includes('<script>bad()'), false);
  assert.match(view.webview.html, /default-src 'none'/);
  await provider.focusSearch();
  assert.equal(posted.at(-1).type, 'focusSearch');
  receive({ type: 'workbench.action.closeWindow' });
  receive({ type: 'open', id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
  assert.equal(calls.length, 1);
  receive({ type: 'open', id: session.id });
  assert.equal(calls.at(-1)[0], 'codexWorkspaceSessions.open');
});

test('live usage selects Codex bucket, preserves used percentages and never substitutes another quota', () => {
  const limits = { limitId: 'codex', primary: { usedPercent: 34, windowDurationMins: 300, resetsAt: 1789398000 }, secondary: { usedPercent: 20, windowDurationMins: 10080 } };
  const snapshot = parseAccountUsage({ rateLimits: { ...limits, primary: { ...limits.primary, usedPercent: 32 } }, rateLimitsByLimitId: { codex: limits } });
  assert.equal(snapshot.primary.usedPercent, 34);
  assert.equal(snapshot.secondary.usedPercent, 20);
  assert.equal(snapshot.source, 'account');
  assert.equal(parseAccountUsage({ rateLimits: limits, rateLimitsByLimitId: { other: limits } }), undefined);
  assert.equal(parseAccountUsage({ rateLimits: { ...limits, limitId: 'other' } }), undefined);
  assert.equal(parseAccountUsage({ rateLimits: { primary: { usedPercent: 101, windowDurationMins: 300 } } }), undefined);
});

test('app-server performs only initialize and rateLimits/read, then closes; cancellation and malformed responses fail', async t => {
  const { home } = await fixture(t);
  const { mock } = vscodeMock(home, home);
  const { requestLimits } = loadWithVscode(mock, '../dist/services/account-usage');
  const server = path.join(home, 'app-server');
  await fs.writeFile(server, `const readline = require('node:readline');
const methods=[];readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);methods.push(m.method);
 if(m.id===0)console.log(JSON.stringify({id:0,result:{}}));
 if(m.id===1)console.log(JSON.stringify({id:1,result:{methods}}));
});`);
  const result = await requestLimits(process.execPath, home, new AbortController().signal);
  assert.deepEqual(result.methods, ['initialize', 'initialized', 'account/rateLimits/read']);
  await fs.writeFile(server, 'console.log(JSON.stringify({id:0,error:{message:"not initialized"}}));');
  await assert.rejects(requestLimits(process.execPath, home, new AbortController().signal), /initialization failed/);
  await fs.writeFile(server, 'setInterval(()=>{},1000);');
  const abort = new AbortController();
  const pending = requestLimits(process.execPath, home, abort.signal);
  abort.abort();
  await assert.rejects(pending, /cancelled/);
});
