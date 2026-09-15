const fs = require('node:fs/promises');
const path = require('node:path');
const { runTests } = require('@vscode/test-electron');

async function main() {
  const root = path.resolve(__dirname, '..');
  const profile = path.join(root, '.vscode-test', 'profile');
  const workspace = path.join(root, '.vscode-test', 'workspace');
  await fs.mkdir(path.join(profile, 'User'), { recursive: true });
  await fs.mkdir(workspace, { recursive: true });
  await fs.writeFile(path.join(profile, 'User', 'settings.json'), JSON.stringify({
    'telemetry.telemetryLevel': 'off', 'update.mode': 'none',
    'extensions.autoUpdate': false, 'extensions.ignoreRecommendations': true,
    'workbench.startupEditor': 'none', 'window.restoreWindows': 'none',
    'chatgpt.runCodexInWindowsSubsystemForLinux': false,
  }));
  const nativePath = process.env.CODEX_NATIVE_EXTENSION_PATH;
  const nativeId = process.env.CODEX_NATIVE_SESSION_ID;
  if (Boolean(nativePath) !== Boolean(nativeId)) throw new Error('Set both CODEX_NATIVE_EXTENSION_PATH and CODEX_NATIVE_SESSION_ID for the optional native integration check.');
  await runTests({
    vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH,
    extensionDevelopmentPath: nativePath ? [root, nativePath] : root,
    extensionTestsPath: path.join(root, 'test', 'host', 'index.cjs'),
    extensionTestsEnv: { CODEX_NATIVE_SESSION_ID: nativeId },
    launchArgs: [workspace, '--user-data-dir', profile, '--extensions-dir', path.join(root, '.vscode-test', 'extensions'),
      '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--disable-updates', '--disable-telemetry', '--no-sandbox'],
  });
}

main().catch(error => { console.error(error); process.exitCode = 1; });
