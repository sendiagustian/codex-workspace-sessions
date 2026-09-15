import * as vscode from 'vscode';
import * as os from 'node:os';
import * as path from 'node:path';
import { resumeCommand, selectSessions, Session } from '../model/session';
import { record } from '../util/json';
import { readAccountUsage } from '../services/account-usage';
import { openNativeSession, openNewSession } from '../services/codex-integration';
import { SessionStore } from '../services/session-store';
import { DetailsProvider } from '../views/session-details-provider';
import { SessionView } from '../views/session-view';
import { UsageView } from '../views/usage-view';

const SECTION = 'codexWorkspaceSessions';

export class SessionController implements vscode.Disposable {
  readonly provider: SessionView;
  readonly details = new DetailsProvider();
  readonly usage = new UsageView();
  readonly view: SessionView;
  private readonly store = new SessionStore();
  private readonly subscriptions: vscode.Disposable[];
  private sessions: Session[] = [];
  private query = '';
  private timer: ReturnType<typeof setInterval> | undefined;
  private generation = 0;
  private running: Promise<void> | undefined;
  private disposed = false;
  private abort: AbortController | undefined;

  constructor(private readonly globalState: vscode.Memento, private readonly workspaceState: vscode.Memento, extensionUri = vscode.Uri.file(path.join(__dirname, '..', '..'))) {
    this.provider = new SessionView(extensionUri);
    this.view = this.provider;
    this.subscriptions = [this.provider, this.usage,
      this.provider.onSearch(query => this.filter(query)),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.invalidate()),
      vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration(SECTION)) this.invalidate(); }),
      vscode.workspace.onDidGrantWorkspaceTrust(() => this.invalidate()),
      this.view.onDidChangeVisibility(() => { this.schedule(); if (this.view.visible) void this.refresh(); }),
      this.usage.onDidChangeVisibility(() => { this.schedule(); if (this.usage.visible) void this.refresh(); }),
    ];
    this.schedule();
  }

  private allowed(): boolean { return !this.disposed && vscode.workspace.isTrusted && this.globalState.get('localAccess', false); }
  private roots(): string[] { return (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file').map(folder => folder.uri.fsPath); }
  private pins(): string[] {
    const value: unknown = this.workspaceState.get('pins', []);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  }

  private home(): string {
    const settings = vscode.workspace.getConfiguration(SECTION).inspect<string>('codexHome');
    return settings?.globalValue?.trim() || process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  }

  private invalidate(): void {
    this.generation++;
    this.abort?.abort();
    this.sessions = [];
    this.provider.update([], []);
    this.store.clear();
    this.details.clear();
    this.usage.update(undefined, 'Refreshing local usage…');
    this.schedule();
    void this.refresh();
  }

  private schedule(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    const seconds = vscode.workspace.getConfiguration(SECTION).get<number>('refreshSeconds', 30);
    if (this.allowed() && (this.view.visible || this.usage.visible) && Number.isFinite(seconds) && seconds > 0) {
      this.timer = setInterval(() => { void this.refresh(); }, Math.max(5, Math.min(3600, seconds)) * 1000);
    }
  }

  async enable(): Promise<void> {
    if (!vscode.workspace.isTrusted) {
      await vscode.window.showInformationMessage('Trust this workspace before enabling session access.');
      return;
    }
    if (!this.allowed()) {
      const answer = await vscode.window.showInformationMessage(
        'Read local Codex session metadata, titles, and usage on this host? Only started chats matching your workspace are listed. For fresh usage, the bundled official Codex app-server checks your account over the network using its existing login. This extension does not read credentials or send prompts. Turn off liveUsage in User Settings for local snapshots only.',
        { modal: true }, 'Enable');
      if (answer !== 'Enable') return;
      await this.globalState.update('localAccess', true);
    }
    this.invalidate();
    await this.refresh();
  }

  async disable(): Promise<void> {
    await this.globalState.update('localAccess', false);
    this.invalidate();
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (this.disposed) return;
    if (this.running) {
      await this.running;
      return;
    }
    this.running = this.reload();
    try { await this.running; }
    finally { this.running = undefined; }
  }

  private async reload(): Promise<void> {
    let generation: number;
    do {
      generation = this.generation;
      await this.load(generation);
    } while (!this.disposed && generation !== this.generation);
  }

  private async load(generation: number): Promise<void> {
    if (!this.allowed()) {
      this.sessions = [];
      this.render();
      this.view.message = 'Local session access is disabled. Enable it to get started.';
      this.usage.update(undefined, 'Enable Local Session Access to show saved usage.');
      return;
    }
    const roots = this.roots();
    if (roots.length === 0) {
      this.sessions = [];
      this.render();
      this.view.message = 'Open a local workspace folder to see its sessions.';
      this.usage.update(undefined, 'Open a local workspace folder to show saved usage.');
      return;
    }
    this.view.message = 'Loading local sessions…';
    this.abort = new AbortController();
    try {
      const descendants = vscode.workspace.getConfiguration(SECTION).get<boolean>('includeSubfolders', false);
      const result = await this.store.scan(this.home(), roots, descendants, this.abort.signal);
      if (generation !== this.generation || !this.allowed()) return;
      this.sessions = result.sessions;
      const live = vscode.workspace.getConfiguration(SECTION).inspect<boolean>('liveUsage')?.globalValue ?? true;
      // Painting the saved snapshot first would flash a stale percentage before the account reply lands.
      if (!live) this.usage.update(result.usage);
      this.render();
      if (result.warnings.length) this.view.message = result.warnings.join(' ');
      if (live) {
        let fresh;
        try { fresh = await readAccountUsage(this.home(), this.abort.signal); }
        catch { fresh = undefined; }
        if (generation !== this.generation || !this.allowed()) return;
        this.usage.update(fresh ?? result.usage, 'Live usage unavailable. Check the official Codex login or refresh.');
      }
    } catch {
      if (generation !== this.generation || !this.allowed()) return;
      this.sessions = [];
      this.render();
      this.view.message = 'Unable to read Codex home. Check the absolute path and permissions in User Settings.';
      this.usage.update(undefined, 'Unable to read Codex home. Check User Settings.');
    }
  }

  private render(): void {
    const visible = selectSessions(this.sessions, this.pins(), this.query);
    this.provider.update(visible, this.pins());
    this.view.description = `${visible.length} sessions${this.query ? ' · filtered' : ''}`;
    this.view.message = visible.length ? undefined : this.query ? 'No sessions match your search. Clear the search field to show all.' : 'No started chats in this workspace. Click + to start a new session.';
  }

  async search(): Promise<void> {
    await this.provider.focusSearch();
  }

  filter(query: string): void {
    if (this.disposed) return;
    this.query = query.slice(0, 200);
    this.render();
  }

  async newSession(): Promise<void> {
    if (!this.allowed()) { await this.enable(); if (!this.allowed()) return; }
    if (!this.roots().length) {
      await vscode.window.showInformationMessage('Open a local workspace folder before starting a session.');
      return;
    }
    const enabled = vscode.workspace.getConfiguration(SECTION).inspect<boolean>('nativeTabs')?.globalValue ?? true;
    const reason = await openNewSession(enabled);
    if (reason) await vscode.window.showInformationMessage(reason);
    else if (this.roots().length > 1) await vscode.window.showInformationMessage('In this multi-root workspace, select the target folder in the Codex composer before sending your first message.');
  }

  private async resolve(argument: unknown): Promise<Session | undefined> {
    if (!this.allowed()) return undefined;
    const id = typeof argument === 'string' ? argument : record(argument) && typeof argument.id === 'string' ? argument.id : undefined;
    await this.refresh();
    if (!this.allowed()) return undefined;
    const current = this.sessions.filter(session => this.roots().some(root => session.workspace === root));
    if (id) return current.find(session => session.id === id);
    const selected = await vscode.window.showQuickPick(current.map(session => ({ label: session.title, description: session.id, session })), { placeHolder: 'Choose a workspace session' });
    if (!this.allowed()) return undefined;
    return this.sessions.find(session => session.id === selected?.session.id);
  }

  async open(argument: unknown): Promise<void> {
    const session = await this.resolve(argument);
    if (!session) return;
    const enabled = vscode.workspace.getConfiguration(SECTION).inspect<boolean>('nativeTabs')?.globalValue ?? true;
    const reason = await openNativeSession(session, enabled);
    if (reason && this.allowed()) await this.details.show(session, reason);
  }

  async showDetails(argument: unknown): Promise<void> {
    const session = await this.resolve(argument);
    if (session) await this.details.show(session);
  }

  async pin(argument: unknown): Promise<void> {
    const session = await this.resolve(argument);
    if (!session) return;
    const pins = this.pins();
    await this.workspaceState.update('pins', pins.includes(session.id) ? pins.filter(id => id !== session.id) : [...pins, session.id]);
    this.render();
  }

  async copyResume(argument: unknown): Promise<void> {
    const session = await this.resolve(argument);
    if (!session) return;
    await vscode.env.clipboard.writeText(resumeCommand(session.id));
    await vscode.window.showInformationMessage('Resume command copied. Run it in a terminal on the same host as Codex.');
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
    this.abort?.abort();
    if (this.timer) clearInterval(this.timer);
    this.store.clear();
    this.details.clear();
    this.sessions = [];
    this.subscriptions.forEach(subscription => subscription.dispose());
  }
}
