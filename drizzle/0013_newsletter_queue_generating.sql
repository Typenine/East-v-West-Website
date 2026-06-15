-- Add a 'generating' status to newsletter_queue_status so the runner can mark an item
-- in-progress while it's actively building the draft (the admin UI shows a spinner).
-- Standalone file: ALTER TYPE ... ADD VALUE is kept isolated and idempotent.
-- Re-applied on every deploy (db-migrate re-runs all files), so IF NOT EXISTS is required.
ALTER TYPE "newsletter_queue_status" ADD VALUE IF NOT EXISTS 'generating';
