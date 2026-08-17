-- EVW research backend: immutable completed-season warehouse and official history objects.
CREATE TABLE IF NOT EXISTS evw_history_snapshots (
  season varchar(8) PRIMARY KEY,
  version varchar(64) NOT NULL,
  league_id varchar(64) NOT NULL,
  source_generated_at timestamptz NOT NULL,
  stored_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS evw_award_records (
  season varchar(8) NOT NULL,
  award_key varchar(64) NOT NULL,
  player_id varchar(64) NOT NULL,
  rules_version varchar(96) NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  PRIMARY KEY (season, award_key, player_id)
);
CREATE INDEX IF NOT EXISTS evw_award_records_player_idx ON evw_award_records (player_id, season);

CREATE TABLE IF NOT EXISTS evw_record_snapshots (
  snapshot_key varchar(128) PRIMARY KEY,
  rules_version varchar(96) NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL
);
