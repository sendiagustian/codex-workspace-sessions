const Module = require('node:module');
const path = require('node:path');

function loadWithVscode(mock, file) {
  const root = path.resolve(__dirname, '../dist') + path.sep;
  for (const key of Object.keys(require.cache)) if (key.startsWith(root)) delete require.cache[key];
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    return request === 'vscode' ? mock : original(request, parent, isMain);
  };
  try { return require(file); }
  finally { Module._load = original; }
}

class Memento {
  constructor(initial = {}) { this.values = { ...initial }; }
  get(key, fallback) { return this.values[key] ?? fallback; }
  async update(key, value) { this.values[key] = value; }
  keys() { return Object.keys(this.values); }
}

function vscodeMock(home, project) {
  const calls = [];
  const settings = { codexHome: home, refreshSeconds: 0, nativeTabs: true };
  const disposable = { dispose() {} };
  const view = { visible: true, ...disposable, onDidChangeVisibility: () => disposable };
  const listeners = {};
  const mock = {
    EventEmitter: class { event = () => disposable; fire() {} dispose() {} },
    TreeItem: class { constructor(label) { this.label = label; } },
    ThemeIcon: class { constructor(id) { this.id = id; } },
    TreeItemCollapsibleState: { None: 0 }, ViewColumn: { Active: -1 },
    TabInputCustom: class { constructor(uri, viewType) { this.uri = uri; this.viewType = viewType; } },
    Uri: { from: value => value, file: value => ({ fsPath: value }), joinPath: (uri, ...parts) => ({ fsPath: path.join(uri.fsPath, ...parts) }) },
    env: { clipboard: { writeText: async text => { calls.push(['clipboard', text]); } } },
    extensions: { getExtension: () => ({ packageJSON: { version: '26.908.40401' }, activate: async () => { calls.push(['activate']); } }) },
    commands: { executeCommand: async (...args) => { calls.push(args); } },
    workspace: {
      isTrusted: true,
      workspaceFolders: [{ uri: { scheme: 'file', fsPath: project } }],
      getConfiguration: () => ({ get: (key, fallback) => settings[key] ?? fallback, inspect: key => ({ globalValue: settings[key], workspaceValue: '/malicious/workspace/override' }) }),
      onDidChangeWorkspaceFolders: listener => { listeners.folders = listener; return disposable; },
      onDidChangeConfiguration: listener => { listeners.configuration = listener; return disposable; },
      onDidGrantWorkspaceTrust: () => disposable,
      openTextDocument: async uri => uri,
    },
    window: {
      tabGroups: { all: [{ viewColumn: 1, tabs: [{ input: { file: 'main.ts' } }] }], get activeTabGroup() { return this.current ?? this.all[0]; } },
      createTreeView: () => view,
      showInformationMessage: async () => 'Enable',
      showInputBox: async () => 'nothing matches',
      showQuickPick: async items => items[0],
      showTextDocument: async document => { calls.push(['details', document]); },
    },
  };
  mock.commands.executeCommand = async (...args) => {
    calls.push(args);
    const groups = mock.window.tabGroups;
    if (args[0] === 'workbench.action.newGroupRight' || args[0] === 'workbench.action.newGroupLeft') {
      groups.current = { viewColumn: groups.all.length + 1, tabs: [] };
      groups.all.push(groups.current);
    } else if (args[0] === 'vscode.openWith') {
      groups.current = groups.all.find(group => group.viewColumn === args[3].viewColumn);
      if (!groups.current.tabs.some(tab => tab.input.uri?.path === args[1].path)) {
        groups.current.tabs.push({ input: new mock.TabInputCustom(args[1], args[2]) });
      }
    } else if (args[0] === 'workbench.action.lockEditorGroup') groups.activeTabGroup.locked = true;
  };
  return { mock, calls, settings, view, listeners };
}

module.exports = { loadWithVscode, Memento, vscodeMock };
