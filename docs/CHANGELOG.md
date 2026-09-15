# Changelog

## 0.1.13

- Add a public README preview with screenshots of the locked Codex split, workspace session sidebar, and current usage panel.
- Include and validate the three public screenshots in the release package.

## 0.1.12

- Stop a refresh from flashing the saved usage snapshot before the account reply arrives.

## 0.1.11

- Widen the session list gutter to 8px to match the section header inset.

## 0.1.10

- Keep a 2px gutter on the session list, and show the pin and actions buttons without hovering.

## 0.1.9

- Drop the 20px body padding the webview host injects, so the session list uses the same gutter as the usage panel.

## 0.1.8

- Line the search icon and placeholder up with the session icon and title.

## 0.1.7

- Run the search field and the session rows edge to edge in the sidebar.

## 0.1.6

- Move the new-session action inside the search field so its box spans the same width as a session row.

## 0.1.5

- Align the search row and the session list on one gutter, and give both a taller hit area.

## 0.1.4

- Detect started chats in the current rollout format, where a user turn is a `response_item` message instead of a `user_message` event.
- Keep only refresh in the view title; the new-session action stays beside the search field.
- Tighten sidebar spacing and replace glyph controls with inline icons.

## 0.1.3

- Add a new workspace chat draft action; only started chats enter the list.
- Move session search into the sidebar with inline pin and session actions.
- Add an original 256px catalog icon.
- Read current account limits via the official bundled Codex app-server, keeping percentages used and labelling local fallback data.

## 0.1.2

- Add a compact Usage panel above workspace sessions with saved usage percentages and reset times.
- Read bounded local usage snapshots without credentials or network access; show unavailable and expired states explicitly.

## 0.1.1

- Open Codex chats in a separate editor group on the right and reuse dedicated chat groups for subsequent clicks.
- Lock the chat group to keep ordinary code-file opening outside it; preserve non-preview chat tabs.
- Serialize rapid session clicks and avoid locking groups containing code files.

## 0.1.0

- Add consent-gated, local-only workspace session browsing.
- Add exact and optional descendant path filters, multi-root workspaces, search, pins, and refresh.
- Add version-gated original Codex editor routing and read-only metadata fallback.
- Add bounded reads, symlink exclusion, tests, and an allowlisted VSIX package audit.
