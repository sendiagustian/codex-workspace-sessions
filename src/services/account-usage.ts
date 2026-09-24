import * as vscode from 'vscode';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { CODEX_EXTENSION } from './codex-integration';
import { parseRecord, record } from '../util/json';
import { parseAccountUsage, UsageSnapshot } from '../model/usage';

export function bundledCodex(): string | undefined {
  const extension = vscode.extensions.getExtension(CODEX_EXTENSION);
  if (!extension?.extensionPath) return undefined;
  if (vscode.env.remoteName || vscode.workspace.getConfiguration('chatgpt').get('runCodexInWindowsSubsystemForLinux', false)) return undefined;
  const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : process.platform === 'linux' ? 'linux' : undefined;
  const arch = process.arch === 'x64' ? 'x86_64' : process.arch === 'arm64' ? 'aarch64' : undefined;
  if (!platform || !arch) return undefined;
  const executable = path.join(extension.extensionPath, 'bin', `${platform}-${arch}`, process.platform === 'win32' ? 'codex.exe' : 'codex');
  return existsSync(executable) ? executable : undefined;
}

export async function readAccountUsage(home: string, signal: AbortSignal): Promise<UsageSnapshot | undefined> {
  const executable = bundledCodex();
  if (!executable) return undefined;
  const result = await requestLimits(executable, home, signal);
  return parseAccountUsage(result);
}

export function requestLimits(executable: string, home: string, signal: AbortSignal): Promise<unknown> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['app-server'], {
      cwd: home, env: { ...process.env, CODEX_HOME: home }, shell: false, windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let buffer = '';
    let received = 0;
    let initialized = false;
    let settled = false;
    const finish = (error?: Error, result?: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      child.kill();
      if (error) reject(error); else resolve(result);
    };
    const cancel = (): void => finish(new Error('Usage request cancelled.'));
    const timer = setTimeout(() => finish(new Error('Usage request timed out.')), 10000);
    const send = (message: unknown): void => { child.stdin.write(JSON.stringify(message) + '\n'); };
    signal.addEventListener('abort', cancel, { once: true });
    child.on('error', () => finish(new Error('Codex app-server could not start.')));
    child.on('exit', () => finish(new Error('Codex app-server closed before responding.')));
    child.stdin.on('error', () => finish(new Error('Codex app-server connection closed.')));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      received += Buffer.byteLength(chunk);
      if (received > 1024 * 1024) { finish(new Error('Usage response exceeded the size limit.')); return; }
      buffer += chunk;
      let newline: number;
      while (!settled && (newline = buffer.indexOf('\n')) >= 0) {
        const message = parseRecord(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        if (message?.id === 0 && !initialized) {
          if (!record(message.result)) { finish(new Error('Codex initialization failed.')); return; }
          initialized = true;
          send({ method: 'initialized' });
          send({ id: 1, method: 'account/rateLimits/read' });
        } else if (message?.id === 1 && initialized) {
          if (message.error) finish(new Error('Account usage is unavailable.'));
          else finish(undefined, message.result);
        }
      }
    });
    send({ id: 0, method: 'initialize', params: { clientInfo: { name: 'codex_workspace_sessions', version: '0.1.15' } } });
  });
}
