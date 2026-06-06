-- Rivalry selection system: cycles, per-team submissions, and published pairings

DO $$ BEGIN
  CREATE TYPE "rivalry_cycle_status" AS ENUM ('not_started', 'open', 'closed', 'calculated', 'published');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "rivalry_pair_status" AS ENUM ('proposed', 'active', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "rivalry_cycles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "status" "rivalry_cycle_status" DEFAULT 'not_started' NOT NULL,
  "opened_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "calculated_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "rivalry_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cycle_id" uuid NOT NULL,
  "team_id" varchar(255) NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "scores" jsonb NOT NULL,
  "reopened_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "rivalry_submissions_cycle_team_idx"
  ON "rivalry_submissions" ("cycle_id", "team_id");

CREATE TABLE IF NOT EXISTS "rivalry_pairs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cycle_id" uuid NOT NULL,
  "team_a_id" varchar(255) NOT NULL,
  "team_b_id" varchar(255) NOT NULL,
  "team_a_score_for_b" integer NOT NULL,
  "team_b_score_for_a" integer NOT NULL,
  "combined_score" integer NOT NULL,
  "is_blood_feud" integer DEFAULT 0 NOT NULL,
  "status" "rivalry_pair_status" DEFAULT 'proposed' NOT NULL,
  "locked_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "rivalry_pairs_cycle_idx"
  ON "rivalry_pairs" ("cycle_id");
