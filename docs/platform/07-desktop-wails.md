# Phase 7 — Desktop app (Wails v3)

Goal: a light, always-available desktop assistant: tray icon, global hotkey to a quick-ask window, native notifications, full chat window.

## Before starting
Check the Wails GitHub releases: at the time of writing, sources disagreed on whether v3.0.0 is final or still beta ("API stable, refinements ongoing"). Tray, multi-window and global hotkeys are v3 features; do not use v2.

## T7.1 Scaffold `apps/desktop`
- `wails3 init` with the React + TypeScript (Vite) template.
- `frontend/` is a workspace package: imports `@kaneki/api-client`, `@kaneki/ui` (shared chat + markdown components), Tailwind v4 config shared with web.
- Go side is kept small: window management, tray, hotkey, keychain, notifications, auto-start. **No business logic in Go**; all data goes through the HTTP API.
- **Accept:** `wails3 dev` opens a window rendering the shared chat component; `wails3 build` binary size is noted in this doc.

## T7.2 Shared UI package `packages/ui`
- Move client-only React components from `apps/web/src/components/chat` (ChatMessage, ToolCallCard, markdown/KaTeX/Mermaid rendering, ModelSwitcher) into `packages/ui`, with no Next.js imports (`next/link`, `next/navigation` replaced by props/callbacks).
- Web imports them back from `@kaneki/ui`.
- **Accept:** web and desktop render the same chat components; web has no visual change.

## T7.3 Auth and storage
- Login with `client: "desktop"` (Phase 2). Refresh token in the OS keychain through Go bindings (`go-keyring`), never in `localStorage`.
- Base URL configurable (production / `http://localhost:3000` for dev).

## T7.4 Windows
| Window | Behaviour |
|---|---|
| Main | Full chat + sessions + Today view; hides to tray on close |
| Quick ask | Small, frameless, always-on-top, opened by **global hotkey** (default `Cmd/Ctrl+Shift+Space`); one input → new or "Quick" session; Esc hides |
| Tray menu | Open, Quick ask, New task, Pause notifications, Quit |

## T7.5 Native features
- Notifications: Wails v3 notification service, fired when polling `/api/v1/notifications/pending` (every few minutes while running) or for local timers.
- Auto-start at login (opt-in setting).
- Device tools (Phase 4 T4.4): `device_clipboard_read` (`needsApproval`), `device_active_app` (later), local file pick for LMS source upload.

## T7.6 Distribution
- GitHub Actions builds macOS (universal), Windows and Linux on tag; artifacts attached to GitHub Releases.
- macOS signing/notarization needs the Apple Developer account; unsigned builds run on your own Mac after allowing them in System Settings → Privacy & Security.
- In-app update check against the latest GitHub release (manual download in v1).

## Done when
The desktop app lives in the tray, the hotkey opens quick-ask and streams an answer with tool calls, and a reminder shows a native notification.
