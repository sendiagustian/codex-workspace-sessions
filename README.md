# Codex Workspace Sessions

An independent VS Code extension that lists local Codex chats for the workspace you have open. Built by Sendi Studio. Not affiliated with, endorsed by, or published by OpenAI. Codex is an OpenAI product.

## Features

- A **Codex Sessions** sidebar with session titles and last activity.
- A compact **Usage** panel above the session list, with current account 5-hour/weekly used percentages and reset times.
- Exact working-directory matching by default, including multi-root workspaces.
- Optional inclusion of sessions from subfolders.
- Search directly in the sidebar by title or session ID, pin sessions within a workspace, and refresh.
- Start a native draft with **+**. Empty drafts stay out of the list until the first user message is saved.
- An original catalog icon, independent of OpenAI branding.
- Automatic refresh every 30 seconds while the view is visible.
- Open the original Codex chat in a separate editor group on the right on a verified Codex version. Later clicks reuse a group containing only Codex tabs.
- Automatically lock the chat editor group so ordinary file opening keeps code outside it. Chat tabs stay open rather than using preview mode.
- Read-only metadata details and a copyable CLI resume command when native tabs are unavailable.
- No runtime dependencies or telemetry. Current usage is requested through the official bundled Codex app-server using its existing login; this extension does not read credentials or send prompts.

## Install and use

1. Install the supplied `.vsix` using **Extensions → … → Install from VSIX…**.
2. Open a trusted local project folder in VS Code 1.100 or newer.
3. Open **Codex Sessions** in the Activity Bar.
4. Select **Enable Local Session Access**, review the metadata notice, and choose **Enable**. This consent is saved on that extension host and applies to later trusted workspaces on the same host.
5. Click **+** for a draft in the current VS Code workspace, or click an existing session. Use the pin button or **…** for details and **Copy resume**.
6. In a multi-root window, select the target folder in the native Codex composer before sending. This extension does not override Codex’s workspace selection.

Use **Codex Sessions: Disable Local Session Access** in the Command Palette to stop reads and clear the in-memory session list. Clear the inline search field to show all sessions. Pins are stored only in VS Code's workspace state and never rename or modify Codex chats.

The editor-group lock is the VS Code padlock shown in the group's title bar. You can unlock or move the group using VS Code's editor-group controls. Clicking another session locks its dedicated chat group again. Existing groups that mix code files and chat tabs are left untouched; a separate chat group is created instead.

**Percentages mean used (terpakai).** Current limits come from the official app-server `account/rateLimits/read` endpoint, refreshed while the panel is visible (default 30 seconds) or with Refresh. The Codex quota bucket is selected explicitly, without adding/subtracting an offset. The panel shows the account update time. If a live read is unavailable, a saved local snapshot is labelled **may be outdated**, or missing data shows a dash. The local snapshot can reflect a previous account after switching logins. API-key accounts may not have ChatGPT subscription limits.

Set `codexWorkspaceSessions.liveUsage` to `false` in User Settings to use only local snapshots. Live reads launch the verified official extension's bundled app-server, use its existing login and configured Codex home, and close after the response. They do not start a model turn. Official Codex may maintain its own caches/logs or refresh its login. An account reading is a point-in-time value, so activity between refreshes can still change the native display.

## Compatibility and honest limits

Native chat tabs currently recognize **OpenAI Codex extension `openai.chatgpt` version `26.908.40401`**. This integration uses VS Code's `vscode.openWith` with the existing Codex custom editor. The editor route is **undocumented by OpenAI and may change**. Other versions show local metadata details instead of guessing a route. Set `codexWorkspaceSessions.nativeTabs` to `false` in User Settings to always use details.

This extension does not provide its own model, login, chat backend, or API quota. Sending messages and loading the actual chat are handled by the official Codex extension under its own permissions and privacy policy. Opening a tab does not send a prompt. A native tab may still show a Codex authentication or loading error.

The local reader uses the observed `sessions/YYYY/MM/DD/rollout-*.jsonl` metadata header and optional `session_index.jsonl` title index. These are not a stable public storage API. Sessions without an index title display `Session <short ID>`. Cloud-only chats, archived sessions, subagent sessions, and drafts with no saved user message are excluded. Worktree paths match their own directory; a different checkout is not silently treated as the same project. No unread/running badges are inferred from timestamps.

Only directories on the **extension host** are read. In Remote SSH, WSL, or containers, install this extension on that host and use its Codex home. Native tabs are disabled in remote windows until tested there. A Windows window configured to run Codex inside WSL does not read Linux sessions automatically; use a WSL window. Browser/virtual workspaces and untrusted workspaces are unsupported.

Large histories are bounded to 20,000 rollout files / 50,000 directory entries per scan, 256 KiB per metadata header, up to 8 MiB to find the first user-message event, 8 MiB of the title index, and 1 MiB from each of up to five recent rollout tails for usage. Usage may be unavailable when the saved event is outside those bounds. The view reports limit or permission problems. Symlinked session directories/files are skipped. File modification time and the title index inform last activity; these are not live execution status.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `codexWorkspaceSessions.codexHome` | empty | Absolute path in User Settings; otherwise `CODEX_HOME`, then `~/.codex`. Workspace overrides are ignored. |
| `codexWorkspaceSessions.refreshSeconds` | `30` | Refresh while visible; `0` disables polling, positive values are at least 5 seconds. |
| `codexWorkspaceSessions.includeSubfolders` | `false` | Include descendants of workspace folders. |
| `codexWorkspaceSessions.liveUsage` | `true` | Read current account usage through the official bundled app-server; User scope only. |
| `codexWorkspaceSessions.nativeTabs` | `true` | Enable verified native-tab integration; machine/User scope only. |

If the list is empty, verify that the saved session working directory matches the open folder, that Codex has saved a local rollout, and that both extensions use the same host. Then refresh.

## Project layout

```
src/
  extension.ts                      activation and command registration
  controller/session-controller.ts  refresh scheduling, state, command handlers
  model/session.ts                  Session type, path matching, sorting
  model/usage.ts                    usage types and rate-limit parsers
  services/local-files.ts           bounded, containment-checked file reads
  services/session-store.ts         rollout discovery and metadata scanning
  services/usage-reader.ts          latest saved usage from recent rollouts
  services/account-usage.ts         bundled Codex app-server client
  services/codex-integration.ts     official Codex extension routing
  util/json.ts                      JSON record guards
  views/webview-assets.ts           template loading, nonce, HTML escaping
  views/session-view.ts             sessions WebviewViewProvider
  views/usage-view.ts               usage WebviewViewProvider
  views/session-details-provider.ts read-only metadata document

media/
  icons/                            activity bar and marketplace icons
  webview/sessions/                 sessions.html, sessions.css, sessions.js
  webview/usage/                    usage.html, usage.css, window partials
```

Markup lives in `.html`, styling in `.css`, and the webview client script in `.js`; TypeScript only fills `{{token}}` placeholders. Both webviews keep a nonce-based CSP, so stylesheets are inlined from `media/webview` at render time and only `sessions.js` is served as a webview resource.

## Development

Use Node.js 22.14 or newer (Node 24 LTS recommended for development).

```sh
npm ci
npm run check
npm run test:host
npm run package
npm run audit:package
```

Press **F5** to launch an isolated Extension Development Host. The ordinary host test downloads a VS Code build and uses a separate profile and extension directory. Set `VSCODE_EXECUTABLE_PATH` to use an existing VS Code executable. The host test does not access real sessions unless the optional native check is explicitly configured.

To check an installed Codex integration, set both `CODEX_NATIVE_EXTENSION_PATH` (the official extension directory) and `CODEX_NATIVE_SESSION_ID` (an existing local session UUID), then run `npm run test:host`. This activates that official extension, opens its custom editor, verifies the selected tab ID, and closes the tab without sending a prompt. This verifies routing, not the authenticated transcript's rendered contents.

See `docs/PRIVACY.md` for storage boundaries, `docs/INTEGRATION.md` for how the Codex integration was derived, and `docs/VALIDATION.md` for what was verified locally.

## Official references

- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [Codex app-server](https://learn.chatgpt.com/docs/app-server)
- [VS Code extension testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [VS Code publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [OpenAI developer commands](https://learn.chatgpt.com/docs/developer-commands)

License: MIT.
