-- Create storage_mode enum and storage_config table if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'storage_mode') THEN
    CREATE TYPE storage_mode AS ENUM ('path','vhost');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS storage_config (
  id varchar(16) PRIMARY KEY,
  chosen_mode storage_mode,
  last_verified_at timestamptz,
  notes text
);

INSERT INTO storage_config (id)
VALUES ('r2')
ON CONFLICT (id) DO NOTHING;
