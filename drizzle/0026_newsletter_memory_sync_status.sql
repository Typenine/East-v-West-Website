-- Track whether BOTH parts of the newsletter learning checkpoint completed.
-- Null status identifies older issues where success was not durably recorded.
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS memory_sync_status varchar(16);
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS memory_sync_error text;
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS memory_sync_checked_at timestamptz;
