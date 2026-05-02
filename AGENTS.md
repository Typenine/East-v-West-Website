# AGENTS.md

## Cursor Cloud specific instructions

### Overview

East v. West (EVW) is a full-stack **Next.js 15** (App Router, Turbopack) fantasy football dynasty league management platform. It uses:
- **TypeScript**, **React 19**, **Tailwind CSS 4**
- **PostgreSQL** via Drizzle ORM (`@neondatabase/serverless` driver in production, local Postgres for dev)
- **Sleeper API** (`api.sleeper.app`) for live league data (public, no auth needed)
- Optional: Cloudflare R2 (media), Groq (AI newsletter), Vercel KV (rate limiting), Discord webhooks, Resend (email)

### Starting the development environment

1. **PostgreSQL must be running** before starting the dev server:
   ```
   pg_ctlcluster 16 main start
   ```
2. **Start the dev server:**
   ```
   npm run dev
   ```
   This runs `next dev --turbopack` on port 3000.

3. **Database connection:** The app uses `@neondatabase/serverless` driver which works over HTTP — it connects to the `DATABASE_URL` in `.env.local`. For local development, the URL is `postgresql://postgres:postgres@localhost:5432/evw`.

### Important notes

- The `.env.local` file (not committed) must contain at least `DATABASE_URL`. Optional env vars: `GROQ_API_KEY`, `R2_*`, `DISCORD_*_WEBHOOK_URL`, `RESEND_API_KEY`.
- **Neon serverless driver + local Postgres:** The `@neondatabase/serverless` package uses HTTP-based connections. It works with local Postgres since the Neon HTTP proxy is not required for the dev server queries that go through `drizzle-orm/neon-http`. The migration script (`db-migrate.mjs`) uses the `pg` package directly.
- **Lint:** `npm run lint` (runs `next lint`). Expect some unused-variable warnings — these are pre-existing.
- **Build:** `npm run build` runs migrations first, then the Next.js build. For dev, just use `npm run dev`.
- **DB migrations:** `npm run db:migrate` applies SQL files from `/drizzle/` using the `pg` package.
- **DB seed:** `npm run db:seed` inserts minimal seed data using the Neon serverless driver.
- No Docker, no devcontainer, no pre-commit hooks, no test framework configured.
- The `ai-bot-project/` directory is a standalone Node.js bot project (separate from the main app) and has its own `node_modules` already committed.
