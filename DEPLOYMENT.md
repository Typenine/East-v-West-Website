# Deployment

How East v. West deploys to Vercel, how database migrations run, and what to
check when something goes wrong.

## Stack

- **Hosting:** Vercel (Next.js 15, App Router, `nodejs` runtime for API routes)
- **Database:** Neon Postgres via Drizzle ORM
- **Media:** Cloudflare R2 (legacy assets still on Vercel Blob)
- **LLMs:** Anthropic Claude (primary) with Gemini / Groq / Cerebras / OpenRouter fallbacks
- **Cron:** GitHub Actions workflows in `.github/workflows/` (newsletter scheduler, taxi cron)

## Deploying

1. Push to `main` → Vercel builds and deploys Production automatically.
2. Any other branch / PR → Vercel creates a Preview deploy.
3. CI (`.github/workflows/ci.yml`) runs type check, lint, and vitest on every
   push/PR to `main`. Fix CI before merging.

There is no manual deploy step. To roll back, use Vercel's "Promote previous
deployment".

## Database migration rules

Migrations are plain SQL files in `drizzle/`, applied by
`scripts/db-migrate.mjs`, which is invoked at build time through
`scripts/migrate-on-build.mjs` (see the `build` script in `package.json`).

Two rules, both load-bearing:

1. **Every statement must be idempotent.** `db-migrate.mjs` re-applies *all*
   files in `drizzle/` on every run — there is no tracking table. Use
   `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
   `CREATE INDEX IF NOT EXISTS`, etc. A non-idempotent statement will fail
   every subsequent build.

2. **Preview deploys never migrate.** `migrate-on-build.mjs` skips migration
   unless `VERCEL_ENV === 'production'`, `VERCEL_ENV` is unset (local build),
   or `ALLOW_BUILD_MIGRATIONS=true` is explicitly set. Never set
   `ALLOW_BUILD_MIGRATIONS=true` on the main project's Preview environment —
   it exists for dedicated staging projects only.

To add a migration:

```
1. Edit src/server/db/schema.ts (Drizzle schema — source of truth for types)
2. Add drizzle/00NN_description.sql with idempotent SQL matching the schema change
3. Local check: npm run db:migrate  (uses DATABASE_URL from .env.local)
4. Deploy — production build applies it automatically
```

## Environment setup

Copy `.env.example` to `.env.local` and fill in values. The same keys go into
Vercel → Project → Settings → Environment Variables. Minimum to run locally:

- `DATABASE_URL` — Neon connection string
- `EVW_ADMIN_SECRET` — admin cookie/header secret
- At least one LLM key (`ANTHROPIC_API_KEY` recommended) to generate newsletters
- `MCP_API_KEY` — only if you need the MCP endpoints

See `.env.example` for the full annotated list.

## Newsletter observability & reliability

- **Generation runs** are recorded in `generation_runs` /
  `generation_run_sections` (provider, tier, fallback flag, duration, errors).
- **Snapshots** of newsletter content are saved to `newsletter_snapshots`
  before every finalize/restore (max 10 per newsletter).
- **MCP calls** are logged (sanitized) to `mcp_call_log`.
- **Admin diagnostics:** `/admin/diagnostics` shows the last 20 runs, section
  detail with retry buttons, and the last 100 MCP calls.
- **Fact audit:** `POST /api/newsletter/fact-audit` runs a Gemini pass that
  flags risky factual claims; results appear in the newsletter editor's
  "Run Health" panel.

All observability writes are fire-and-forget — a database outage can never
fail a generation step or an MCP tool call.

## Troubleshooting

- **Build fails in migration step:** check the build log for
  `[migrate-on-build]`. Migration failures are non-fatal by design (the build
  continues), but the schema may be stale — run `npm run db:migrate` manually
  against production `DATABASE_URL`.
- **Newsletter generation blocked:** the validation gate
  (`src/lib/newsletter/validation-gate.ts`) blocks runs with bad context data.
  Check `/admin/diagnostics` for the run's `blocked` status and error summary;
  re-run with `force=true` only if the data is verified-correct.
- **A section failed mid-run:** retry just that step from
  `/admin/diagnostics` (uses `POST /api/newsletter/generate-step` with a
  `step` override), or regenerate from the admin newsletter page.
- **Tests fail locally with a `styleText` import error:** your Node is older
  than 20.12. Vitest 4 needs Node ≥ 20.12 (CI uses 22).
