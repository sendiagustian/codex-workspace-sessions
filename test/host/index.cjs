const assert = require('node:assert/strict');
const vscode = require('vscode');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { SessionView } = require('../../dist/views/session-view');
const { DetailsProvider } = require('../../dist/views/session-details-provider');
const { openNativeSession, openNewSession, CODEX_EDITOR } = require('../../dist/services/codex-integration');

async function run() {
  const extension = vscode.extensions.getExtension('sendistudio.codex-workspace-sessions');
  assert.ok(extension, 'Extension is registered in the actual VS Code host');
  await extension.activate();
  const views = extension.packageJSON.contributes.views.codexWorkspaceSessions;
  assert.equal(views[0].id, 'codexWorkspaceSessions.usage');
  assert.equal(views[0].type, 'webview');
  await vscode.commands.executeCommand('codexWorkspaceSessions.usage.focus');
  const commands = await vscode.commands.getCommands(true);
  for (const name of ['newSession', 'enable', 'disable', 'refresh', 'open', 'search', 'pin', 'details', 'copyResume', 'openCodex']) {
    assert.ok(commands.includes(`codexWorkspaceSessions.${name}`), `${name} command is registered`);
  }
  await vscode.commands.executeCommand('codexWorkspaceSessions.disable');
  await vscode.commands.executeCommand('codexWorkspaceSessions.refresh');
  await vscode.commands.executeCommand('codexWorkspaceSessions.open', 'not-a-session');
  const session = { id: randomUUID(), title: '<script>Plain text title</script>', cwd: __dirname, workspace: __dirname, updatedAt: Date.now() };
  const provider = new SessionView(extension.extensionUri);
  provider.update([session], [session.id]);
  assert.equal(provider.getChildren()[0].title, session.title);
  assert.equal(views[1].type, 'webview');
  await vscode.commands.executeCommand('codexWorkspaceSessions.search');
  provider.dispose();
  const details = new DetailsProvider();
  const registration = vscode.workspace.registerTextDocumentContentProvider('codex-session-host-test', details);
  const detailUri = vscode.Uri.from({ scheme: 'codex-session-host-test', path: '/missing.txt' });
  const document = await vscode.workspace.openTextDocument(detailUri);
  assert.match(document.getText(), /no longer available/);
  registration.dispose();
  if (process.env.CODEX_NATIVE_SESSION_ID) {
    const codeDocument = await vscode.workspace.openTextDocument({ content: 'const main = true;', language: 'typescript' });
    await vscode.window.showTextDocument(codeDocument, { preview: false, viewColumn: vscode.ViewColumn.One });
    const mainGroup = vscode.window.tabGroups.activeTabGroup;
    const nativeSession = { ...session, id: process.env.CODEX_NATIVE_SESSION_ID };
    const reason = await openNativeSession(nativeSession, true);
    assert.equal(reason, undefined, reason);
    const tab = vscode.window.tabGroups.all.flatMap(group => group.tabs).find(tab =>
      tab.input instanceof vscode.TabInputCustom && tab.input.viewType === CODEX_EDITOR && tab.input.uri.path === `/local/${nativeSession.id}`);
    assert.ok(tab, 'Original Codex custom editor tab has the exact selected session ID');
    assert.equal(tab.isPreview, false);
    const chatGroup = tab.group;
    assert.notEqual(chatGroup, mainGroup, 'Chat is separate from the main code editor');
    const sidebarOnRight = vscode.workspace.getConfiguration('workbench').get('sideBar.location') === 'right';
    assert.equal(chatGroup.viewColumn > mainGroup.viewColumn, sidebarOnRight, 'Chat is split toward the primary sidebar');
    const groupCount = vscode.window.tabGroups.all.length;
    assert.equal(await openNativeSession(nativeSession, true), undefined);
    assert.equal(vscode.window.tabGroups.all.length, groupCount, 'Repeat click reuses the chat group');
    assert.equal(vscode.window.tabGroups.activeTabGroup, chatGroup);
    const anotherFile = await vscode.workspace.openTextDocument({ content: 'const second = true;', language: 'typescript' });
    await vscode.window.showTextDocument(anotherFile, { preview: false });
    assert.notEqual(vscode.window.tabGroups.activeTabGroup, chatGroup, 'Locked chat group rejects unrelated files opened without an explicit column');
    assert.ok(chatGroup.tabs.every(tab => tab.input instanceof vscode.TabInputCustom && tab.input.viewType === CODEX_EDITOR));
    assert.equal(await openNewSession(true), undefined);
    const draft = chatGroup.tabs.find(tab => tab.input instanceof vscode.TabInputCustom && tab.input.uri.path === '/extension/panel/new');
    assert.ok(draft, 'New session opens the native draft composer in the existing chat group');
    await vscode.window.tabGroups.close(draft);
    console.log('PASS: original Codex tab opens in a reused sidebar-adjacent group; group lock keeps new code files outside (no prompt sent).');
    await vscode.window.tabGroups.close(tab);
  }
  console.log('PASS: VS Code host activation, commands, consent-disabled actions, session panel and document provider.');
  const artifacts = path.resolve(__dirname, '../../artifacts');
  await fs.mkdir(artifacts, { recursive: true });
  await fs.writeFile(path.join(artifacts, 'host-test.json'), JSON.stringify({
    vscodeVersion: vscode.version, activation: 'passed', commands: 'passed',
    consentDisabledActions: 'passed', sessionAndDocumentProviders: 'passed',
    usageViewRegistration: 'passed',
    nativeTabRouting: process.env.CODEX_NATIVE_SESSION_ID ? 'passed' : 'not requested',
    sidebarSplitAndLock: process.env.CODEX_NATIVE_SESSION_ID ? 'passed' : 'not requested',
    nativeDraft: process.env.CODEX_NATIVE_SESSION_ID ? 'passed' : 'not requested',
    codexVersion: vscode.extensions.getExtension('openai.chatgpt')?.packageJSON.version ?? null,
    transcriptRendering: 'not asserted', completedAt: new Date().toISOString(),
  }, null, 2));
}

module.exports = { run };
