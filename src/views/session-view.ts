import * as vscode from 'vscode';
import { SESSION_ID, Session } from '../model/session';
import { record } from '../util/json';
import { asset, createNonce, fill } from './webview-assets';

const WEBVIEW_FOLDER = ['media', 'webview', 'sessions'] as const;
const ACTIONS = ['open', 'pin', 'details', 'copyResume'];

export function sessionHtml(script: string): string {
  const nonce = createNonce();
  return fill(asset('sessions', 'sessions.html'), {
    nonce,
    style: asset('sessions', 'sessions.css'),
    script,
  });
}

export class SessionView implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private sessions: readonly Session[] = [];
  private pins: readonly string[] = [];
  private status: string | undefined;
  private count = '';
  private query = '';
  private ready = false;
  private focusRequested = false;
  private readonly listeners: vscode.Disposable[] = [];
  private readonly visibility = new vscode.EventEmitter<void>();
  private readonly searched = new vscode.EventEmitter<string>();
  readonly onDidChangeVisibility = this.visibility.event;
  readonly onSearch = this.searched.event;

  constructor(private readonly extensionUri: vscode.Uri) {}

  get visible(): boolean {
    return this.view?.visible ?? false;
  }

  get message(): string | undefined {
    return this.status;
  }

  set message(value: string | undefined) {
    this.status = value;
    this.render();
  }

  set description(value: string) {
    this.count = value;
    if (this.view) this.view.description = value;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.listeners.splice(0).forEach(listener => listener.dispose());
    this.view = view;
    this.ready = false;
    const folder = vscode.Uri.joinPath(this.extensionUri, ...WEBVIEW_FOLDER);
    view.webview.options = { enableScripts: true, localResourceRoots: [folder] };
    const script = view.webview.asWebviewUri(vscode.Uri.joinPath(folder, 'sessions.js'));
    view.webview.html = sessionHtml(script.toString());
    view.description = this.count;
    this.listeners.push(
      view.onDidChangeVisibility(() => this.visibility.fire()),
      view.onDidDispose(() => {
        this.view = undefined;
        this.visibility.fire();
      }),
      view.webview.onDidReceiveMessage((message: unknown) => this.receive(message)),
    );
    this.visibility.fire();
  }

  update(sessions: readonly Session[], pins: readonly string[]): void {
    this.sessions = sessions;
    this.pins = pins;
    this.render();
  }

  getChildren(): Session[] {
    return [...this.sessions];
  }

  async focusSearch(): Promise<void> {
    this.focusRequested = true;
    await vscode.commands.executeCommand('codexWorkspaceSessions.list.focus');
    this.focusWhenReady();
  }

  /** Accepts only known actions carrying a session ID that is currently listed. */
  private receive(message: unknown): void {
    if (!record(message)) return;
    if (message.type === 'ready') {
      this.ready = true;
      this.render();
      this.focusWhenReady();
      return;
    }
    if (message.type === 'search' && typeof message.query === 'string') {
      this.query = message.query.slice(0, 200);
      this.searched.fire(this.query);
      return;
    }
    if (typeof message.type !== 'string') return;
    if (
      message.type === 'enable' ||
      message.type === 'newSession' ||
      (ACTIONS.includes(message.type) &&
        typeof message.id === 'string' &&
        SESSION_ID.test(message.id) &&
        this.sessions.some(session => session.id === message.id))
    ) {
      void vscode.commands.executeCommand('codexWorkspaceSessions.' + message.type, message.id);
    }
  }

  private focusWhenReady(): void {
    if (!this.view || !this.ready || !this.focusRequested) return;
    this.focusRequested = false;
    void this.view.webview.postMessage({ type: 'focusSearch' });
  }

  private render(): void {
    if (this.view) {
      void this.view.webview.postMessage({
        type: 'sessions',
        sessions: this.sessions,
        pins: this.pins,
        message: this.status,
        query: this.query,
      });
    }
  }

  dispose(): void {
    this.listeners.splice(0).forEach(listener => listener.dispose());
    this.visibility.dispose();
    this.searched.dispose();
    this.sessions = [];
    this.view = undefined;
  }
}
