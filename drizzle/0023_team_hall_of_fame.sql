CREATE TABLE IF NOT EXISTS team_hall_of_fame (
  id BIGSERIAL PRIMARY KEY,
  franchise_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  induction_year INTEGER NOT NULL,
  bio TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ,
  removed_by TEXT,
  removal_reason TEXT,
  CONSTRAINT team_hall_of_fame_franchise_player_unique UNIQUE (franchise_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_team_hall_of_fame_active_franchise
  ON team_hall_of_fame (franchise_id, induction_year DESC)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_team_hall_of_fame_active_player
  ON team_hall_of_fame (player_id)
  WHERE removed_at IS NULL;
