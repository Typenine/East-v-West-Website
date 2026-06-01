-- Phase 3: Admin personality settings tables
-- bot_settings: per-bot voice overrides, phrase additions, safety boundaries
-- team_narrative_cards: per-team narrative card overrides
-- phrase_pools: general phrase pools including banned_global

DO $$ BEGIN
  CREATE TYPE "bot_name" AS ENUM ('entertainer', 'analyst');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "bot_settings" (
  "bot" "bot_name" PRIMARY KEY,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "display_name" varchar(255),
  "role_description" text,
  "voice_config" jsonb DEFAULT null,
  "signature_phrases" jsonb DEFAULT null,
  "banned_phrases" jsonb DEFAULT null,
  "safety_boundaries" jsonb DEFAULT null,
  "phase_stances" jsonb DEFAULT null,
  "admin_notes" text
);

CREATE TABLE IF NOT EXISTS "team_narrative_cards" (
  "team_name" varchar(255) PRIMARY KEY,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "card_data" jsonb DEFAULT '{}' NOT NULL
);

CREATE TABLE IF NOT EXISTS "phrase_pools" (
  "pool_key" varchar(128) PRIMARY KEY,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "phrases" jsonb DEFAULT '[]' NOT NULL,
  "admin_notes" text
);
