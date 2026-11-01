# Kaneki LMS — Setup & Configuration Guide

This guide covers environment configuration, database migrations with `pgvector` on Neon, running the app locally, and connecting external AI clients (Claude Desktop, Cursor, Antigravity) to the Kaneki Model Context Protocol (MCP) server.

---

## 1. Environment Variables

Create or update your `.env.local` file with the required credentials:

```bash
# Database (Neon Serverless PostgreSQL)
DATABASE_URL="postgresql://user:password@ep-sample-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Authentication Mode: "jwt" (production multi-user), "open" (local single-user), or "locked"
AUTH_MODE="jwt"
JWT_SECRET="your-32-byte-secret-key-goes-here"

# LLM Backend (Ollama Cloud or OpenAI-compatible endpoint)
OLLAMA_BASE_URL="https://ollama.com/v1"
OLLAMA_API_KEY="your-ollama-api-key"
OLLAMA_MODEL="gpt-oss:120b"

# Text Embeddings (for pgvector RAG indexing & semantic search)
EMBEDDING_API_URL="https://ollama.com/api/embeddings"
EMBEDDING_API_KEY="your-embedding-api-key"
EMBEDDING_MODEL="nomic-embed-text"

# GitHub Knowledge Repository (for committing study guides, notes, & project briefs)
GITHUB_PAT="ghp_yourPersonalAccessTokenWithRepoScope"
GITHUB_OWNER="your-github-username"
GITHUB_REPO="my_kaneki"
GITHUB_BRANCH="main"

# Model Context Protocol (MCP) Security
# When set, enables external MCP clients to connect to POST /api/mcp
KANEKI_MCP_API_KEY="your-secure-mcp-bearer-token"
```

---

## 2. Database Migrations & Neon `pgvector` Setup

Kaneki uses Neon PostgreSQL with the `pgvector` extension for hybrid full-text and vector semantic search.

### Enabling `pgvector` on Neon
Neon supports `pgvector` natively. To confirm or enable it on your Neon console:
1. Open your Neon project dashboard.
2. Go to the **SQL Editor**.
3. Run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

### Running Schema Migrations
Execute all schema migrations in order (`migrations/*.sql`):
```bash
npm run db:migrate
```

This applies:
- `001_users.sql`: User authentication and accounts
- `002_todos.sql`: Tasks and workspace todos
- `003_audit_log.sql`: Audit logging for security compliance
- `004_chat_sessions.sql`: Persistent AI conversation histories
- `005_lms_core.sql`: Core LMS relational schema (learner profiles, subjects, DAG nodes, edges, quizzes, spaced repetition)
- `006_lms_vector.sql`: 1536-dimensional vector column and HNSW cosine index on `lms_rag_chunks`
- `007_lms_usage.sql`: Telemetry and rate-limiting usage log

---

## 3. Running Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run full test suite (78+ unit and integration tests)
npm test

# Typecheck and production build
npm run build
```

---

## 4. Connecting External AI Clients to `/api/mcp`

The Kaneki LMS MCP Server exposes 14 tools, resources, and prompt templates over stateless Streamable HTTP at `POST /api/mcp`.

### Claude Desktop Configuration
Add the Kaneki server to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kaneki-lms": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote-bridge",
        "--url",
        "http://localhost:3000/api/mcp",
        "--header",
        "Authorization: Bearer your-secure-mcp-bearer-token"
      ]
    }
  }
}
```

### Cursor IDE Configuration
1. Open Cursor Settings -> **Features** -> **MCP**.
2. Click **+ Add New MCP Server**.
3. Select **Type: HTTP / SSE**.
4. Set Server URL: `http://localhost:3000/api/mcp` (or your production URL `https://your-domain.vercel.app/api/mcp`).
5. Add HTTP Header: `Authorization: Bearer your-secure-mcp-bearer-token`.

### Antigravity CLI / Agent Configuration
In your project `.gemini/settings.json`:
```json
{
  "mcpServers": {
    "kaneki-lms": {
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer your-secure-mcp-bearer-token"
      }
    }
  }
}
```

---

## 5. Security & Rate Limiting

- **Cross-Owner Isolation**: Every tool and API route enforces ownership checks. Users can only access and modify their own subjects, notes, and quiz submissions.
- **Upload Safety**: File uploads via BYOS are capped at 50MB and restricted to `.pdf`, `.docx`, `.xlsx`, `.csv`, `.md`, and `.txt`. Spreadsheets are capped at 500 rows per sheet to prevent zip-bomb / memory attacks.
- **Answer Key Protection**: Answer keys (`correctOption`) are stripped from quiz payloads server-side before delivery to clients. Answer keys are only revealed after the learner submits their attempt.
- **Telemetry & Cost Control**: Every LLM judge and embedding call records token usage to `lms_usage_log`. Daily budgets are enforced per owner to prevent runaway API spend.
