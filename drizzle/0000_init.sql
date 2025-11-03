-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE suggestion_status AS ENUM ('draft','open','accepted','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE taxi_event AS ENUM ('add','remove','promote','demote');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tables
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL UNIQUE,
  display_name varchar(255),
  role user_role NOT NULL DEFAULT 'user',
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);

CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  abbrev varchar(32) NOT NULL UNIQUE,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  position varchar(16) NOT NULL,
  nfl_team varchar(16),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS players_pos_idx ON players(position);
CREATE INDEX IF NOT EXISTS players_nfl_idx ON players(nfl_team);

CREATE TABLE IF NOT EXISTS suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  text text NOT NULL,
  category varchar(64),
  status suggestion_status NOT NULL DEFAULT 'open',
  created_at timestamp NOT NULL DEFAULT now(),
  resolved_at timestamp
);
CREATE INDEX IF NOT EXISTS suggestions_user_idx ON suggestions(user_id);
CREATE INDEX IF NOT EXISTS suggestions_status_created_idx ON suggestions(status, created_at);

CREATE TABLE IF NOT EXISTS taxi_squad_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id),
  player_id uuid NOT NULL REFERENCES players(id),
  active_from timestamp NOT NULL DEFAULT now(),
  active_to timestamp,
  CONSTRAINT uniq_member_active UNIQUE (team_id, player_id, active_to)
);
CREATE INDEX IF NOT EXISTS taxi_members_team_idx ON taxi_squad_members(team_id);
CREATE INDEX IF NOT EXISTS taxi_members_player_idx ON taxi_squad_members(player_id);
CREATE INDEX IF NOT EXISTS taxi_members_active_to_idx ON taxi_squad_members(active_to);

CREATE TABLE IF NOT EXISTS taxi_squad_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id),
  player_id uuid NOT NULL REFERENCES players(id),
  event_type taxi_event NOT NULL,
  event_at timestamp NOT NULL DEFAULT now(),
  meta jsonb
);
CREATE INDEX IF NOT EXISTS taxi_events_team_at_idx ON taxi_squad_events(team_id, event_at);
CREATE INDEX IF NOT EXISTS taxi_events_player_at_idx ON taxi_squad_events(player_id, event_at);

CREATE TABLE IF NOT EXISTS media_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type varchar(64) NOT NULL,
  owner_id uuid,
  file_key text NOT NULL,
  content_type varchar(128),
  url text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_slug varchar(128) NOT NULL UNIQUE,
  hash text NOT NULL,
  salt text NOT NULL,
  pin_version integer NOT NULL DEFAULT 1,
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_pins_slug_idx ON team_pins(team_slug);
