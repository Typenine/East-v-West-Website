-- Add trade_pending for Discord trade rumor dedupe (cron trade-notifier).
-- Idempotent on PostgreSQL 15+ (skipped if value already exists).
ALTER TYPE discord_notification_type ADD VALUE IF NOT EXISTS 'trade_pending';
