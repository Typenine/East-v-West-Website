-- Heartbeat row written by the scheduled newsletter queue runner on every pass.
-- The admin editorial calendar reads it to show whether the runner is alive —
-- a stale heartbeat is the "items stuck queued" early-warning. Idempotent
-- (re-applied every deploy).
CREATE TABLE IF NOT EXISTS "newsletter_runner_status" (
  "id" varchar(16) PRIMARY KEY,
  "last_seen_at" timestamp with time zone NOT NULL,
  "last_result" text
);
