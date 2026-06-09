-- Polls / Votes system

-- Enums
DO $$ BEGIN
  CREATE TYPE poll_status AS ENUM ('draft', 'open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE round_status AS ENUM ('pending', 'open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE vote_type AS ENUM ('borda', 'irv', 'select_one', 'select_multi', 'eliminate', 'yes_no');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE threshold_type AS ENUM ('plurality', 'majority', 'supermajority', 'admin_defined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE result_visibility AS ENUM ('immediate', 'all_voted', 'admin_publish');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE eligibility_type AS ENUM ('team', 'person');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE question_type AS ENUM ('short_answer', 'paragraph', 'rating', 'multiple_choice', 'checkboxes', 'section_break');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- polls
CREATE TABLE IF NOT EXISTS polls (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                   varchar(255) NOT NULL,
  description             text,
  status                  poll_status NOT NULL DEFAULT 'draft',
  eligibility_type        eligibility_type NOT NULL DEFAULT 'team',
  linked_suggestion_ids   text[],
  anonymous               boolean NOT NULL DEFAULT false,
  result_visibility       result_visibility NOT NULL DEFAULT 'admin_publish',
  deadline                timestamptz,
  discord_notified_open   boolean NOT NULL DEFAULT false,
  discord_notified_reminder boolean NOT NULL DEFAULT false,
  discord_notified_closed boolean NOT NULL DEFAULT false,
  confirmation_message    text,
  response_limit          integer,
  created_at              timestamptz NOT NULL DEFAULT now(),
  closed_at               timestamptz
);
CREATE INDEX IF NOT EXISTS polls_status_idx ON polls(status);
CREATE INDEX IF NOT EXISTS polls_created_idx ON polls(created_at DESC);

-- poll_rounds
CREATE TABLE IF NOT EXISTS poll_rounds (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id          uuid NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  round_number     integer NOT NULL,
  status           round_status NOT NULL DEFAULT 'pending',
  vote_type        vote_type NOT NULL DEFAULT 'yes_no',
  survivor_count   integer,
  threshold_type   threshold_type NOT NULL DEFAULT 'plurality',
  threshold_value  integer,
  shuffle_options  boolean NOT NULL DEFAULT false,
  results_published_at timestamptz,
  opened_at        timestamptz,
  closed_at        timestamptz
);
CREATE INDEX IF NOT EXISTS poll_rounds_poll_idx ON poll_rounds(poll_id);

-- poll_options
CREATE TABLE IF NOT EXISTS poll_options (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id              uuid NOT NULL REFERENCES poll_rounds(id) ON DELETE CASCADE,
  text                  varchar(500) NOT NULL,
  linked_suggestion_id  uuid,
  carried_from_option_id uuid REFERENCES poll_options(id) ON DELETE SET NULL,
  display_order         integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS poll_options_round_idx ON poll_options(round_id);

-- poll_votes
CREATE TABLE IF NOT EXISTS poll_votes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id      uuid NOT NULL REFERENCES poll_rounds(id) ON DELETE CASCADE,
  voter_id      varchar(255) NOT NULL,
  voter_display varchar(255),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_vote_per_round UNIQUE (round_id, voter_id)
);
CREATE INDEX IF NOT EXISTS poll_votes_round_idx ON poll_votes(round_id);

-- poll_vote_selections
CREATE TABLE IF NOT EXISTS poll_vote_selections (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id   uuid NOT NULL REFERENCES poll_votes(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  rank      integer,
  selected  boolean
);
CREATE INDEX IF NOT EXISTS poll_vote_selections_vote_idx ON poll_vote_selections(vote_id);

-- poll_questions (form builder)
CREATE TABLE IF NOT EXISTS poll_questions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id              uuid NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  question_type        question_type NOT NULL DEFAULT 'short_answer',
  text                 varchar(1000) NOT NULL,
  description          text,
  required             boolean NOT NULL DEFAULT true,
  shuffle_options      boolean NOT NULL DEFAULT false,
  display_order        integer NOT NULL DEFAULT 0,
  rating_min           integer NOT NULL DEFAULT 1,
  rating_max           integer NOT NULL DEFAULT 10,
  rating_min_label     varchar(100),
  rating_max_label     varchar(100),
  max_length           integer,
  condition_question_id uuid REFERENCES poll_questions(id) ON DELETE SET NULL,
  condition_option_id  uuid,
  condition_value      text
);
CREATE INDEX IF NOT EXISTS poll_questions_poll_idx ON poll_questions(poll_id);

-- poll_question_options
CREATE TABLE IF NOT EXISTS poll_question_options (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   uuid NOT NULL REFERENCES poll_questions(id) ON DELETE CASCADE,
  text          varchar(500) NOT NULL,
  display_order integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS poll_question_options_q_idx ON poll_question_options(question_id);

-- poll_responses (form submissions)
CREATE TABLE IF NOT EXISTS poll_responses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id       uuid NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  voter_id      varchar(255) NOT NULL,
  voter_display varchar(255),
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_response_per_poll UNIQUE (poll_id, voter_id)
);
CREATE INDEX IF NOT EXISTS poll_responses_poll_idx ON poll_responses(poll_id);

-- poll_response_answers
CREATE TABLE IF NOT EXISTS poll_response_answers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES poll_responses(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES poll_questions(id) ON DELETE CASCADE,
  text_answer text,
  rating_value integer,
  option_ids  text[]
);
CREATE INDEX IF NOT EXISTS poll_response_answers_resp_idx ON poll_response_answers(response_id);
