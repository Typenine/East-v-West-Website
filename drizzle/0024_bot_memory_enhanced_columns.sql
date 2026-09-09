-- Bring the live bot_memory table in sync with the Drizzle schema used by
-- newsletter continuity, personality memory, and editorial corrections.
-- The original newsletter migration created only the legacy columns.

ALTER TABLE bot_memory
  ADD COLUMN IF NOT EXISTS enhanced_data JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE bot_memory
  ADD COLUMN IF NOT EXISTS editorial_corrections JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$ BEGIN
  ALTER TYPE summary_mood ADD VALUE IF NOT EXISTS 'Chaotic';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE summary_mood ADD VALUE IF NOT EXISTS 'Vindicated';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
