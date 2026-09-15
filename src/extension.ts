import * as vscode from 'vscode';
import { SessionController } from './controller/session-controller';
import { openCodexSidebar } from './services/codex-integration';

export function activate(context: vscode.ExtensionContext): void {
  const controller = new SessionController(context.globalState, context.workspaceState, context.extensionUri);
  context.subscriptions.push(controller,
    vscode.window.registerWebviewViewProvider('codexWorkspaceSessions.list', controller.provider),
    vscode.window.registerWebviewViewProvider('codexWorkspaceSessions.usage', controller.usage),
    vscode.workspace.registerTextDocumentContentProvider('codex-session-details', controller.details));
  const actions: Record<string, (argument: unknown) => Promise<void>> = {
    enable: () => controller.enable(), disable: () => controller.disable(), refresh: () => controller.refresh(),
    search: () => controller.search(), newSession: () => controller.newSession(), open: argument => controller.open(argument),
    details: argument => controller.showDetails(argument), pin: argument => controller.pin(argument),
    copyResume: argument => controller.copyResume(argument), openCodex: () => openCodexSidebar(),
  };
  for (const [name, action] of Object.entries(actions)) {
    context.subscriptions.push(vscode.commands.registerCommand(`codexWorkspaceSessions.${name}`, async (argument: unknown) => {
      try { await action(argument); }
      catch { await vscode.window.showErrorMessage('Codex Sessions could not complete this action. Check your settings and the Codex extension output.'); }
    }));
  }
  void controller.refresh();
}
