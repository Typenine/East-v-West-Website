CREATE TABLE IF NOT EXISTS taxi_observations (
  team varchar(255) PRIMARY KEY,
  updated_at timestamp NOT NULL DEFAULT now(),
  players jsonb NOT NULL
);
