-- Fact-audit result column on generation_runs.
-- NOTE: scripts/db-migrate.mjs re-applies ALL files in drizzle/ on every run with no
-- tracking table, so every statement here MUST be idempotent.

ALTER TABLE "generation_runs" ADD COLUMN IF NOT EXISTS "fact_audit" jsonb;
