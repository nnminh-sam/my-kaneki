# Phase 5 — Background jobs and notifications

Goal: the assistant can act without a request from the user — reminders at exact times, a daily brief, periodic nudges — and reach the user on their devices.

## T5.1 Migration `migrations/013_jobs_push.sql`
- `scheduled_jobs (id text pk, owner_id, kind text, payload jsonb, run_at timestamptz, status text check in ('pending','queued','done','failed','cancelled'), qstash_message_id text, attempts int, last_error text, created_at, updated_at)`; index `(status, run_at)`.
- `push_tokens (id, owner_id, device_session_id, provider text check in ('expo'), token text unique, platform, created_at, last_seen_at, disabled_at)`.
- `notification_prefs (owner_id pk, quiet_hours jsonb, channels jsonb, daily_brief_at time, timezone text)`.

## T5.2 Two schedulers, one job model
| Need | Mechanism | Why |
|---|---|---|
| Daily brief, nightly summaries, cleanup | **Vercel Cron** → `GET /api/v1/jobs/cron/daily` | Free; Hobby allows once per day per job. |
| Exact-time reminders ("remind me at 3pm") | **Upstash QStash** delayed message → `POST /api/v1/jobs/run/:id` | Hobby cron can't do per-minute; QStash free ≈ 1,000 messages/day. |
- `scheduleJob(ownerId, kind, payload, runAt)` writes a row and publishes to QStash with `notBefore = runAt`. Cancel = mark cancelled + delete the QStash message.
- Job handlers are verified: Cron via `CRON_SECRET` header, QStash via its signature (`Upstash-Signature`). Jobs run with `ToolContext.client = "job"` and may use only `readOnly` tools unless the job kind allows writes.
- Handlers are idempotent (check `status` before running).

## T5.3 Job kinds (v1)
- `reminder` — send a push with the text.
- `daily_brief` — agent run (non-streaming `generateText`) over read-only tools: today's tasks, due reviews (LMS), calendar summary; result saved as a chat message in a "Daily" session and pushed as a short notification.
- `srs_due` — nudge when spaced-repetition reviews are due.
- New modules register their own kinds via `module.jobs`.

## T5.4 Push delivery
- Mobile registers its Expo push token after login: `POST /api/v1/push/tokens`.
- `sendPush(ownerId, { title, body, data: { deepLink } })` → Expo Push API; disable tokens on `DeviceNotRegistered`.
- Respect quiet hours and per-channel prefs.
- Desktop gets notifications locally (Wails), triggered when the app polls `/api/v1/notifications/pending` or receives a deep link; no server push to desktop in v1.

## T5.5 Agent tools
`reminders_create`, `reminders_list`, `reminders_cancel` in a `reminders` module, using `scheduleJob`. The agent must confirm the absolute time in the user's timezone in its reply.

## Done when
"Remind me in 10 minutes to stretch" said in chat produces a push on the phone 10 minutes later, and the daily brief arrives each morning.
