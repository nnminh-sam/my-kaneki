# my_kaneki

Central workspace hub built with **Next.js (App Router)**, **Neon PostgreSQL** (`@neondatabase/serverless`), and **HS256 JWT Authentication**, ready to deploy on **Vercel**.

## Features

- **Adaptive Learning Management System (LMS)**:
  - **Bring Your Own Sources (BYOS)**: In-memory parsing for PDF, DOCX, XLSX, CSV, and Markdown notes normalized and indexed into Neon `pgvector`.
  - **Autonomous Research Loop**: Multi-round peer-review debate state machine with citation validation and human escalation resolution.
  - **Curriculum DAG Engine**: Cycle-free topological dependency path validation with progressive difficulty tiering and capstone project milestones.
  - **Binary Search Diagnostic Placement**: Fast adaptive entry tier assessment in $\mathcal{O}(\log_2 N)$ questions.
  - **Polymorphic Quiz Runner**: Accessible multiple-choice (MCQ-4), open-ended concept questions evaluated by LLM judge, coding challenges with constraints, and project milestone verification checklists.
  - **Daily Spaced Repetition (SRS)**: SM-2 memory schedule tracking conceptual stability, intervals, and retention rate.
  - **Embedded Socratic Tutor**: Context-scoped AI tutor sidekick grounded in module study guides and RAG references.
  - **Model Context Protocol (MCP)**: Stateless streamable HTTP server at `/api/mcp` exporting 14 LMS tools to external AI clients (Claude Desktop, Cursor, Antigravity).

- **Collapsible & Responsive Workspace Shell**:
  - **Workspace Navigation**:
    - `Overview` (`/`) — AI Assistant Chat with tool integrations
    - `Self-Learning` (`/learning`) — Adaptive DAG, Study Guides, Mastery Gates & Spaced Repetition
    - `Todo & Planning` (`/todos`) — Tasks, schedules & milestones
    - `Notes` (`/notes`) — GitHub-backed knowledge base & Markdown editor
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

## Remote MCP Server (`/api/mcp`)

The LMS subsystem exposes a stateless streamable HTTP Model Context Protocol (MCP) server at `/api/mcp`.

### Authentication
Generate a personal API key (`knk_...`) in the web UI under **Settings** (`/settings`), then pass it in the `Authorization` header:
- Personal API Key: `Authorization: Bearer knk_...`
- Session JWT: `Authorization: Bearer <JWT>`

### Connecting from Cursor / Claude Desktop

Add the server to your Cursor MCP settings or `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "my_kaneki": {
      "url": "https://your-kaneki-domain.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer knk_your_personal_api_key"
      }
    }
  }
}
```
For local development:
```json
{
  "mcpServers": {
    "my_kaneki_local": {
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer knk_your_personal_api_key"
      }
    }
  }
}
```
