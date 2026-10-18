# my_kaneki

Central workspace hub built with **Next.js (App Router)**, **Neon PostgreSQL** (`@neondatabase/serverless`), and **HS256 JWT Authentication**, ready to deploy on **Vercel**.

## Features (Phase 1 — Core Layout & Auth)

- **Collapsible & Responsive Sidebar**:
  - **Workspace Navigation**:
    - `Overview` (`/`)
    - `Self-Learning` (`/learning`) — Coding, Research, DSA & System Design
    - `Todo & Planning` (`/todos`) — Tasks, schedules & milestones
    - `Notes` (`/notes`) — Knowledge base & study notes
  - **Connected External Apps** (open in a new tab):
    - `my_finance` → [`https://myfinance-one-hazel.vercel.app/calendar`](https://myfinance-one-hazel.vercel.app/calendar)
    - `my_pm_agent` → [`https://my-pm-agent-rouge.vercel.app/projects`](https://my-pm-agent-rouge.vercel.app/projects)
- **JWT Authentication + Neon PostgreSQL**:
  - Pure `node:crypto` HS256 JWT session tokens (`kaneki_session` HttpOnly cookie + `Authorization: Bearer <token>` support) with sliding 2-hour renewal.
  - `scrypt` password hashing stored in Neon PostgreSQL (`users` table).
  - First-account owner sign-up (plus optional `KANEKI_SIGNUP_EMAILS` allowlist for additional accounts).

## Local Setup

1. Copy `.env.example` to `.env.local` and fill in your Neon connection strings and `JWT_SECRET`:
   ```bash
   cp .env.example .env.local
   ```
   Generate a 32+ character `JWT_SECRET`:
   ```bash
   openssl rand -hex 32
   ```

2. Verify Neon database connectivity and run SQL migrations:
   ```bash
   npm run db:smoke
   npm run db:migrate
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

## Deploying to Vercel

1. Push the repository or run `vercel` from the project root.
2. Connect your **Neon** database integration (or set `DATABASE_URL` and `DATABASE_URL_UNPOOLED` in Vercel Environment Variables).
3. Add `JWT_SECRET` (at least 32 characters) in Vercel Environment Variables.
4. Run `npm run db:migrate` against your production Neon database.
