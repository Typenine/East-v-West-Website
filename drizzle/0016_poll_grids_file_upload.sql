-- Grid questions and file upload for polls

DO $$ BEGIN ALTER TYPE question_type ADD VALUE 'multiple_choice_grid';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TYPE question_type ADD VALUE 'checkbox_grid';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TYPE question_type ADD VALUE 'file_upload';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS poll_question_grid_rows (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES poll_questions(id) ON DELETE CASCADE,
  text       varchar(500) NOT NULL,
  display_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS poll_question_grid_rows_q_idx ON poll_question_grid_rows(question_id);
