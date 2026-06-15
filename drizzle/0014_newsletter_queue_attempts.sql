-- Bounded auto-retry for the editorial queue: track how many times the runner has
-- attempted an item so a transient failure self-heals on the next run instead of
-- stranding the item in 'failed' forever. Idempotent (re-applied every deploy).
ALTER TABLE IF EXISTS "newsletter_queue" ADD COLUMN IF NOT EXISTS "attempts" integer NOT NULL DEFAULT 0;
