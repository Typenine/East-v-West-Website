-- Add unique constraint so each team can only have one submission per cycle.
-- Uses CREATE UNIQUE INDEX IF NOT EXISTS (idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS "rivalry_submissions_cycle_team_unique"
  ON "rivalry_submissions" ("cycle_id", "team_id");
