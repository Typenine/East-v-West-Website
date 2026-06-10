-- Observability tables: generation runs, run sections, newsletter snapshots, MCP call log.
-- NOTE: scripts/db-migrate.mjs re-applies ALL files in drizzle/ on every run with no
-- tracking table, so every statement here MUST be idempotent (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "generation_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" varchar(64) NOT NULL UNIQUE,
  "season" integer NOT NULL,
  "week" integer NOT NULL,
  "episode_type" varchar(64) NOT NULL,
  "run_type" varchar(32) NOT NULL DEFAULT 'staged',
  "status" varchar(32) NOT NULL DEFAULT 'running',
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz,
  "error_summary" text,
  "context_packet" jsonb,
  "validation" jsonb,
  "warnings" jsonb DEFAULT '[]'::jsonb,
  "total_steps" integer,
  "completed_steps" integer,
  "failed_steps" jsonb DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS "generation_runs_season_week_idx" ON "generation_runs" ("season", "week");
CREATE INDEX IF NOT EXISTS "generation_runs_started_idx" ON "generation_runs" ("started_at");

CREATE TABLE IF NOT EXISTS "generation_run_sections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" varchar(64) NOT NULL,
  "section_name" varchar(128) NOT NULL,
  "status" varchar(32) NOT NULL,
  "provider" varchar(64),
  "model" varchar(128),
  "tier" integer,
  "is_fallback" boolean NOT NULL DEFAULT false,
  "duration_ms" integer,
  "input_tokens" integer,
  "output_tokens" integer,
  "retries" integer NOT NULL DEFAULT 0,
  "warnings" jsonb DEFAULT '[]'::jsonb,
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "generation_run_sections_run_idx" ON "generation_run_sections" ("run_id");

CREATE TABLE IF NOT EXISTS "newsletter_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "season" integer NOT NULL,
  "week" integer NOT NULL,
  "run_id" varchar(64),
  "action_type" varchar(32) NOT NULL,
  "note" text,
  "content" jsonb NOT NULL,
  "html" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "newsletter_snapshots_season_week_idx" ON "newsletter_snapshots" ("season", "week", "created_at");

CREATE TABLE IF NOT EXISTS "mcp_call_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tool" varchar(128) NOT NULL,
  "args" jsonb,
  "status" varchar(16) NOT NULL,
  "duration_ms" integer,
  "response_bytes" integer,
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "mcp_call_log_created_idx" ON "mcp_call_log" ("created_at");
CREATE INDEX IF NOT EXISTS "mcp_call_log_tool_idx" ON "mcp_call_log" ("tool");
