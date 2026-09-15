import * as vscode from 'vscode';
import { Session, SESSION_ID } from '../model/session';

export const CODEX_EXTENSION = 'openai.chatgpt';
export const CODEX_EDITOR = 'chatgpt.conversationEditor';
export const VERIFIED_CODEX_VERSIONS: readonly string[] = ['26.908.40401'];
let opening: Promise<string | undefined> = Promise.resolve(undefined);

export async function openNativeSession(session: Session, enabled: boolean): Promise<string | undefined> {
  if (!SESSION_ID.test(session.id)) throw new Error('Invalid session ID.');
  const open = () => openCompatibleRoute(`/local/${session.id}`, enabled);
  opening = opening.then(open, open);
  return opening;
}

export async function openNewSession(enabled: boolean): Promise<string | undefined> {
  const open = () => openCompatibleRoute('/extension/panel/new', enabled);
  opening = opening.then(open, open);
  return opening;
}

function isCodexTab(tab: vscode.Tab): boolean {
  return tab.input instanceof vscode.TabInputCustom && tab.input.viewType === CODEX_EDITOR;
}

async function openInChatGroup(uri: vscode.Uri): Promise<void> {
  const groups = vscode.window.tabGroups;
  const chatGroups = groups.all.length > 1 ? groups.all.filter(group => group.tabs.length > 0 && group.tabs.every(isCodexTab)) : [];
  const existing = chatGroups.find(group => group.tabs.some(tab => tab.input instanceof vscode.TabInputCustom && tab.input.uri.path === uri.path)) ?? chatGroups[0];
  let column = existing?.viewColumn;
  if (column === undefined) {
    await vscode.commands.executeCommand('workbench.action.newGroupRight');
    column = groups.activeTabGroup.viewColumn;
  }
  await vscode.commands.executeCommand('vscode.openWith', uri, CODEX_EDITOR, {
    viewColumn: column, preserveFocus: false, preview: false,
  });
  const active = groups.activeTabGroup;
  if (active.viewColumn !== column || !active.tabs.length || !active.tabs.every(isCodexTab)) {
    throw new Error('The dedicated Codex group is no longer active.');
  }
  await vscode.commands.executeCommand('workbench.action.lockEditorGroup');
}

async function openCompatibleRoute(route: string, enabled: boolean): Promise<string | undefined> {
  if (!enabled) return 'Native Codex tabs are disabled in settings.';
  const extension = vscode.extensions.getExtension(CODEX_EXTENSION);
  if (!extension) return 'Install the official OpenAI Codex extension to open native chat tabs.';
  const version: unknown = extension.packageJSON.version;
  if (typeof version !== 'string' || !VERIFIED_CODEX_VERSIONS.includes(version)) {
    return 'This Codex version has not been verified for native tabs. Use the Codex sidebar or copy the CLI resume command.';
  }
  if (vscode.env.remoteName) return 'Native Codex tabs are not yet verified in remote windows. Use the Codex sidebar or CLI on the same host.';
  if (vscode.workspace.getConfiguration('chatgpt').get<boolean>('runCodexInWindowsSubsystemForLinux', false)) {
    return 'Codex is configured to run in WSL. Open this project in a WSL window to browse sessions on that host.';
  }
  try {
    await extension.activate();
    const uri = vscode.Uri.from({ scheme: 'openai-codex', authority: 'route', path: route });
    await openInChatGroup(uri);
    return undefined;
  } catch {
    return 'Codex could not open this session. Check the Codex extension output and use the CLI resume command if needed.';
  }
}

export async function openCodexSidebar(): Promise<void> {
  const extension = vscode.extensions.getExtension(CODEX_EXTENSION);
  if (!extension) {
    await vscode.window.showInformationMessage('Install the official OpenAI Codex extension (openai.chatgpt) first.');
    return;
  }
  await extension.activate();
  await vscode.commands.executeCommand('chatgpt.openSidebar');
}
