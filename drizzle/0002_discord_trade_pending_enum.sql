-- Ensure enum exists before adding values (fresh DB-safe).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'discord_notification_type') THEN
    CREATE TYPE discord_notification_type AS ENUM (
      'trade_accepted',
      'trade_pending',
      'trade_complete',
      'newsletter_published'
    );
  END IF;
END $$;

-- Ensure all required enum values exist (idempotent on PostgreSQL 15+).
ALTER TYPE discord_notification_type ADD VALUE IF NOT EXISTS 'trade_accepted';
ALTER TYPE discord_notification_type ADD VALUE IF NOT EXISTS 'trade_pending';
ALTER TYPE discord_notification_type ADD VALUE IF NOT EXISTS 'trade_complete';
ALTER TYPE discord_notification_type ADD VALUE IF NOT EXISTS 'newsletter_published';

-- Ensure dedupe table exists for trade/newsletter Discord notifications.
CREATE TABLE IF NOT EXISTS discord_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  notification_type discord_notification_type NOT NULL,
  dedupe_key varchar(255) NOT NULL,
  posted_at timestamptz DEFAULT now() NOT NULL,
  meta jsonb
);

CREATE INDEX IF NOT EXISTS discord_notifications_type_key_idx
  ON discord_notifications(notification_type, dedupe_key);
