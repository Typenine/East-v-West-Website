CREATE TABLE IF NOT EXISTS projection_overrides (
  id bigserial PRIMARY KEY,
  season integer,
  week integer,
  player_id varchar(64),
  nfl_team varchar(8),
  role_label varchar(128),
  active_probability double precision,
  start_probability double precision,
  target_share double precision,
  carry_share double precision,
  pass_attempt_share double precision,
  team_pass_attempts double precision,
  team_rush_attempts double precision,
  projection_points double precision,
  note text,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projection_overrides_subject_check CHECK (player_id IS NOT NULL OR nfl_team IS NOT NULL),
  CONSTRAINT projection_overrides_week_check CHECK (week IS NULL OR (week >= 1 AND week <= 18)),
  CONSTRAINT projection_overrides_active_probability_check CHECK (active_probability IS NULL OR (active_probability >= 0 AND active_probability <= 1)),
  CONSTRAINT projection_overrides_start_probability_check CHECK (start_probability IS NULL OR (start_probability >= 0 AND start_probability <= 1)),
  CONSTRAINT projection_overrides_target_share_check CHECK (target_share IS NULL OR (target_share >= 0 AND target_share <= 1)),
  CONSTRAINT projection_overrides_carry_share_check CHECK (carry_share IS NULL OR (carry_share >= 0 AND carry_share <= 1)),
  CONSTRAINT projection_overrides_pass_share_check CHECK (pass_attempt_share IS NULL OR (pass_attempt_share >= 0 AND pass_attempt_share <= 1))
);

CREATE INDEX IF NOT EXISTS projection_overrides_lookup_idx
  ON projection_overrides (season, week, player_id, nfl_team, active, updated_at DESC);

CREATE TABLE IF NOT EXISTS projection_validation_results (
  season integer NOT NULL,
  week integer NOT NULL,
  team varchar(255) NOT NULL,
  model_version varchar(64) NOT NULL,
  source varchar(16) NOT NULL,
  player_id varchar(64) NOT NULL,
  position varchar(16) NOT NULL,
  prediction_bucket varchar(16) NOT NULL,
  projection double precision NOT NULL,
  actual double precision NOT NULL,
  error double precision NOT NULL,
  absolute_error double precision NOT NULL,
  range_low double precision NOT NULL,
  range_high double precision NOT NULL,
  range_covered boolean NOT NULL,
  snapshot_generated_at timestamptz NOT NULL,
  validated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season, week, team, model_version, source, player_id)
);

CREATE INDEX IF NOT EXISTS projection_validation_calibration_idx
  ON projection_validation_results (model_version, position, prediction_bucket, validated_at DESC);

CREATE INDEX IF NOT EXISTS projection_validation_week_idx
  ON projection_validation_results (season, week, source, model_version);
