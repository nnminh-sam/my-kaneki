# Phase 6 — Mobile app (Expo)

Goal: a fast phone app focused on what is used on the go: chat with the assistant, quick capture, today's tasks, reminders.

## T6.1 Scaffold `apps/mobile`
- `create-expo-app` (latest SDK, New Architecture on), TypeScript, **expo-router**.
- Styling: **NativeWind** (Tailwind classes, close to the web look). Icons: `lucide-react-native`.
- Use a **development build** (not Expo Go) because of push, secure store and later health/calendar modules.
- Set up Metro for the monorepo per Expo's monorepo guide (watch folders, pnpm linker setting).
- **Accept:** app runs on an iOS simulator and an Android device, importing `@kaneki/api-client` and a zod schema from a module.

## T6.2 Auth
- Login screen → `POST /auth/token` with `client: "mobile"`, device name from `expo-device`.
- Refresh token in `expo-secure-store`; access token in memory; optional biometric unlock (`expo-local-authentication`) before showing data.
- **Accept:** cold start with a stored refresh token goes straight to the home screen.

## T6.3 Screens (v1)
| Tab | Content |
|---|---|
| Assistant | Chat via `useChat` + `createChatTransport({ fetch: expoFetch })`, session list, markdown rendering, tool cards, approval cards |
| Today | Tasks due today, reminders, SRS reviews due |
| Capture | One input: "add task / note / expense" sent straight to the API (no LLM) for speed |
| Settings | Model/provider, notifications, devices, sign out |
- Data fetching with TanStack Query over `@kaneki/api-client`; refetch on focus.
- Markdown: a React Native markdown renderer for chat; KaTeX/Mermaid rendered in a small WebView only when present.

## T6.4 Push and deep links
- Register with `expo-notifications`, send the token to `/push/tokens` (Phase 5).
- Deep links (`kaneki://chat/:sessionId`, `kaneki://tasks/:id`) open the right screen from a notification.

## T6.5 Device tools (Phase 4 T4.4)
- `device_calendar_events` via `expo-calendar`; `device_schedule_notification` via `expo-notifications`.
- Later: `device_health_summary` via HealthKit / Health Connect libraries (needs a config plugin; read-only, summary only).
- Each needs a permission prompt the first time; denied → tool returns a structured "permission denied".

## T6.6 Offline (minimal v1)
- Capture tab writes to a local outbox (AsyncStorage/SQLite) when offline and flushes on reconnect.
- Everything else is online-only in v1.

## T6.7 Builds and install
- Android: EAS free build or local `npx expo run:android --variant release`; sideload the APK.
- iOS: needs the Apple Developer Program ($99/year) to stay installed; otherwise re-sign every 7 days from Xcode.
- OTA updates for JS-only changes via `expo-updates` (EAS Update free tier).

## Done when
On a real phone: sign in once, chat with tool calls, add a task by capture, receive a reminder push and tap it into the app.
