import * as vscode from 'vscode';
import { cleanLabel, Session } from '../model/session';

/** Renders read-only session metadata in a virtual text document. No transcript is loaded. */
export class DetailsProvider implements vscode.TextDocumentContentProvider {
  private readonly documents = new Map<string, string>();

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.documents.get(uri.path) ?? 'Session details are no longer available.';
  }

  async show(session: Session, reason?: string): Promise<void> {
    const uri = vscode.Uri.from({
      scheme: 'codex-session-details',
      path: `/${session.id}.txt`,
      query: String(Date.now()),
    });
    this.documents.set(uri.path, [
      session.title,
      '',
      reason ?? 'Local Codex session metadata',
      '',
      `Session ID: ${session.id}`,
      `Workspace: ${cleanLabel(session.workspace)}`,
      `Working directory: ${cleanLabel(session.cwd)}`,
      `Last activity: ${new Date(session.updatedAt).toISOString()}`,
      '',
      'No transcript is loaded by this extension.',
      'Right-click the session to copy its CLI resume command.',
      'Command Palette: Codex Sessions: Open Codex Sidebar',
    ].join('\n'));
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, { preview: true });
  }

  clear(): void {
    this.documents.clear();
  }
}
