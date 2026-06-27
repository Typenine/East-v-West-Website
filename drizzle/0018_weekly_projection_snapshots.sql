CREATE TABLE IF NOT EXISTS weekly_projection_snapshots (
  season integer NOT NULL,
  week integer NOT NULL,
  team varchar(255) NOT NULL,
  model_version varchar(64) NOT NULL,
  phase varchar(32) NOT NULL,
  snapshot_date date NOT NULL,
  generated_at timestamptz NOT NULL,
  earliest_kickoff timestamptz,
  payload jsonb NOT NULL,
  PRIMARY KEY (season, week, team, model_version, phase, snapshot_date)
);

CREATE INDEX IF NOT EXISTS weekly_projection_snapshots_lookup_idx
  ON weekly_projection_snapshots (season, week, team, generated_at DESC);
