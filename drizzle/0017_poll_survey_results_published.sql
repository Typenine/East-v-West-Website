-- Allow commissioners to publish survey (form-only) results separately from closing the poll.
ALTER TABLE polls ADD COLUMN IF NOT EXISTS results_published_at timestamptz;

-- Existing closed surveys: treat as already published so members keep access.
UPDATE polls
SET results_published_at = COALESCE(closed_at, NOW())
WHERE status = 'closed' AND results_published_at IS NULL;
