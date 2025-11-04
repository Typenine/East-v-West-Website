CREATE TABLE IF NOT EXISTS user_docs (
  user_id varchar(64) PRIMARY KEY,
  team varchar(255) NOT NULL,
  version integer NOT NULL DEFAULT 0,
  updated_at timestamp NOT NULL DEFAULT now(),
  votes jsonb,
  trade_block jsonb,
  trade_wants jsonb
);
CREATE INDEX IF NOT EXISTS user_docs_team_idx ON user_docs(team);
