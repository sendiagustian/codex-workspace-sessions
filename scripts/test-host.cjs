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
  const extensionDevelopmentPath = [root];
  if (nativePath) {
    extensionDevelopmentPath.push(nativePath);
    const manifest = JSON.parse(await fs.readFile(path.join(nativePath, 'package.json'), 'utf8'));
    const extensionDirectory = path.dirname(nativePath);
    const entries = await fs.readdir(extensionDirectory, { withFileTypes: true });
    for (const dependency of manifest.extensionDependencies ?? []) {
      const directory = entries.find(entry => entry.isDirectory() && entry.name === `${dependency}-${manifest.version}`)
        ?? entries.find(entry => entry.isDirectory() && entry.name.startsWith(`${dependency}-`));
      if (!directory) throw new Error(`Missing Codex extension dependency: ${dependency}`);
      extensionDevelopmentPath.push(path.join(extensionDirectory, directory.name));
    }
  }
  await runTests({
    vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH,
    extensionDevelopmentPath: nativePath ? extensionDevelopmentPath : root,
    extensionTestsPath: path.join(root, 'test', 'host', 'index.cjs'),
    extensionTestsEnv: { CODEX_NATIVE_SESSION_ID: nativeId },
    launchArgs: [workspace, '--user-data-dir', profile, '--extensions-dir', path.join(root, '.vscode-test', 'extensions'),
      '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--disable-updates', '--disable-telemetry', '--no-sandbox'],
  });
}

main().catch(error => { console.error(error); process.exitCode = 1; });
