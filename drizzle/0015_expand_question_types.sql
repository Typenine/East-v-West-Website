-- Expand poll question types for Google Forms–style polls + yes/no

DO $$ BEGIN ALTER TYPE question_type ADD VALUE 'yes_no';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TYPE question_type ADD VALUE 'dropdown';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TYPE question_type ADD VALUE 'date';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TYPE question_type ADD VALUE 'time';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TYPE question_type ADD VALUE 'number';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TYPE question_type ADD VALUE 'email';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
