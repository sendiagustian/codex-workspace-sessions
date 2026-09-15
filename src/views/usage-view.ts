import * as vscode from 'vscode';
import { UsageSnapshot, UsageWindow } from '../model/usage';
import { asset, createNonce, escapeText, fill } from './webview-assets';

function duration(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function resetLabel(window: UsageWindow, now: number): string {
  if (window.resetsAt === undefined) return 'Reset time unavailable';
  const remaining = Math.ceil((window.resetsAt - now) / 60000);
  if (remaining <= 0) return 'Reset passed · awaiting update';
  if (remaining >= 1440) return `Resets in ${Math.floor(remaining / 1440)}d ${Math.floor((remaining % 1440) / 60)}h`;
  if (remaining >= 60) return `Resets in ${Math.floor(remaining / 60)}h ${remaining % 60}m`;
  return `Resets in ${remaining}m`;
}

function windowLabel(window: UsageWindow | undefined, secondary: boolean): string {
  if (!window) return secondary ? 'Weekly' : 'Session';
  const name = secondary ? (window.windowMinutes === 10080 ? 'Weekly' : 'Secondary') : (window.windowMinutes === 300 ? 'Session' : 'Primary');
  return `${name} (${duration(window.windowMinutes)})`;
}

function windowHtml(window: UsageWindow | undefined, secondary: boolean, now: number): string {
  const label = windowLabel(window, secondary);
  return fill(asset('usage', 'usage-window.html'), {
    label,
    percent: window ? `${Number(window.usedPercent.toFixed(1))}% used` : '—',
    bar: window ? fill(asset('usage', 'usage-bar.html'), { value: String(window.usedPercent), label }) : asset('usage', 'usage-bar-empty.html'),
    reset: window ? resetLabel(window, now) : 'No saved usage data',
  });
}

export function usageHtml(snapshot: UsageSnapshot | undefined, message: string, now = Date.now()): string {
  const nonce = createNonce();
  const note = snapshot ? `${snapshot.source === 'account' ? 'Account updated' : 'Local snapshot · may be outdated'} ${new Date(snapshot.observedAt).toLocaleString()}.` : message;
  return fill(asset('usage', 'usage.html'), {
    nonce,
    style: asset('usage', 'usage.css'),
    windows: windowHtml(snapshot?.primary, false, now) + windowHtml(snapshot?.secondary, true, now),
    note: escapeText(note),
  });
}

export class UsageView implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private snapshot: UsageSnapshot | undefined;
  private message = 'Enable Local Session Access to show saved usage.';
  private readonly listeners: vscode.Disposable[] = [];
  private readonly visibility = new vscode.EventEmitter<void>();
  readonly onDidChangeVisibility = this.visibility.event;
  get visible(): boolean { return this.view?.visible ?? false; }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.listeners.splice(0).forEach(listener => listener.dispose());
    this.view = view;
    view.webview.options = { enableScripts: false, localResourceRoots: [] };
    this.listeners.push(view.onDidChangeVisibility(() => this.visibility.fire()), view.onDidDispose(() => { this.view = undefined; this.visibility.fire(); }));
    this.render();
    this.visibility.fire();
  }

  update(snapshot: UsageSnapshot | undefined, message = 'No saved usage yet. Use Codex, then refresh.'): void {
    this.snapshot = snapshot;
    this.message = message;
    this.render();
  }

  private render(): void {
    if (this.view) this.view.webview.html = usageHtml(this.snapshot, this.message);
  }

  dispose(): void {
    this.listeners.splice(0).forEach(listener => listener.dispose());
    this.visibility.dispose();
    this.snapshot = undefined;
    this.view = undefined;
  }
}
