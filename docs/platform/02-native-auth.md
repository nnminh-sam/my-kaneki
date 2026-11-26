# Phase 2 — Auth for native clients

Goal: desktop and mobile stay signed in safely for weeks, each device can be listed and revoked, and the web cookie flow keeps working.

## Model
- **Access token:** existing HS256 JWT, short TTL (**15 min**) for native clients. Claims add `sid` (device session id) and `cli` (`web|desktop|mobile`).
- **Refresh token:** opaque random string (`knr_…`), stored server-side as a SHA-256 hash, **30-day** sliding expiry, **rotated on every use**.
- **Reuse detection:** if an already-rotated refresh token is presented, revoke the whole device session (likely theft).
- **Web** keeps the HttpOnly `kaneki_session` cookie with the current 2-hour sliding renewal; it does not need refresh tokens.

## T2.1 Migration `migrations/012_device_sessions.sql`
- `device_sessions (id text pk, owner_id text, client text check in ('web','desktop','mobile'), device_name text, platform text, refresh_hash text unique, prev_refresh_hash text, created_at, last_used_at, expires_at, revoked_at)`.
- Index `(owner_id, revoked_at)`.
- **Accept:** migrate is idempotent; PGlite test loads it.

## T2.2 Endpoints (in `packages/api`, group `/auth`)
| Endpoint | Body | Returns |
|---|---|---|
| `POST /auth/token` | `{ email, password, client, deviceName, platform }` | `{ accessToken, accessExpiresAt, refreshToken, sessionId }` |
| `POST /auth/refresh` | `{ refreshToken }` | new pair (rotation) |
| `POST /auth/logout` | `{ refreshToken }` | revokes this device session |
| `GET /auth/sessions` | — | list of device sessions for the owner |
| `DELETE /auth/sessions/:id` | — | revoke another device |

- Reuse `scrypt` password check and signup allowlist from `src/lib/auth/users.ts`.
- Rate-limit `/auth/token` and `/auth/refresh` per IP + email.
- Access-token verification checks that `sid` is not revoked (cache revoked ids in memory for 60 s to avoid a DB hit per request).
- **Accept:** tests for login, refresh rotation, reuse detection revoking the session, logout, revoked session → 401, expired refresh → 401.

## T2.3 Client token storage
- **Mobile:** `expo-secure-store` (Keychain / Keystore). Access token in memory only.
- **Desktop:** OS keychain via Go (`github.com/zalando/go-keyring`), exposed to the frontend through Wails bindings `GetRefreshToken/SetRefreshToken/ClearRefreshToken`. Never in `localStorage`.
- `packages/api-client` handles: attach access token → on 401, call `/auth/refresh` once (single-flight) → retry → on failure call `onUnauthorized` (go to login).

## T2.4 CORS and origins
- Native mobile `fetch` is not subject to CORS. Desktop webview and Expo web are.
- `ALLOWED_ORIGINS` env: production web origin, `http://localhost:3000`, the Wails webview origin (check Wails v3 docs for the exact scheme per OS), Expo web dev origin.
- Credentials (cookies) are allowed only for the web origin; native clients use Bearer.

## T2.5 Settings UI
Add a "Devices" section in web `/settings`: list sessions, last used, revoke.

## Done when
A script can log in with `/auth/token`, call `/api/v1/tasks`, refresh after expiry, and be locked out after revoking its session from the web settings page.
