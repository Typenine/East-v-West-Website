-- Create leagues table for multi-league support
CREATE TABLE IF NOT EXISTS leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identity
  slug varchar(64) NOT NULL UNIQUE,
  name varchar(255) NOT NULL,
  short_name varchar(32),
  
  -- Sleeper integration
  sleeper_league_id varchar(64),
  sleeper_league_ids jsonb DEFAULT '{}',
  
  -- Branding
  logo_url text,
  primary_color varchar(16),
  secondary_color varchar(16),
  team_colors jsonb DEFAULT '{}',
  
  -- Configuration
  config jsonb DEFAULT '{}',
  
  -- Rules
  rules_content text,
  rules_file_key text,
  
  -- Metadata
  founded_year integer,
  setup_completed boolean DEFAULT false NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS leagues_slug_idx ON leagues(slug);
CREATE INDEX IF NOT EXISTS leagues_sleeper_idx ON leagues(sleeper_league_id);

-- Extend users table for league membership
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS league_id uuid REFERENCES leagues(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS team_name varchar(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS sleeper_user_id varchar(64);
CREATE INDEX IF NOT EXISTS users_league_idx ON users(league_id);

-- Create league_invites table for team signup
CREATE TABLE IF NOT EXISTS league_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES leagues(id),
  team_name varchar(255) NOT NULL,
  roster_id integer,
  invite_code varchar(64) NOT NULL UNIQUE,
  default_pin varchar(64),
  claimed_at timestamptz,
  claimed_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS league_invites_league_idx ON league_invites(league_id);
CREATE INDEX IF NOT EXISTS league_invites_code_idx ON league_invites(invite_code);

-- Add league_id column to core tables (nullable for backward compatibility)
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS league_id uuid REFERENCES leagues(id);
ALTER TABLE team_pins ADD COLUMN IF NOT EXISTS league_id uuid REFERENCES leagues(id);
ALTER TABLE user_docs ADD COLUMN IF NOT EXISTS league_id uuid REFERENCES leagues(id);
ALTER TABLE trade_block_events ADD COLUMN IF NOT EXISTS league_id uuid REFERENCES leagues(id);

-- Create indexes for league_id columns
CREATE INDEX IF NOT EXISTS suggestions_league_idx ON suggestions(league_id);
CREATE INDEX IF NOT EXISTS team_pins_league_idx ON team_pins(league_id);
CREATE INDEX IF NOT EXISTS user_docs_league_idx ON user_docs(league_id);
CREATE INDEX IF NOT EXISTS trade_block_events_league_idx ON trade_block_events(league_id);
