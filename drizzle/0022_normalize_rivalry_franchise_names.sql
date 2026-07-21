-- Normalize legacy names for the franchise now known as Cascade Marauders.
-- Idempotent because the replacement value does not match any legacy predicate.
UPDATE rivalry_pairs
SET team_a_id = 'Cascade Marauders'
WHERE lower(regexp_replace(team_a_id, '[^a-z0-9]+', '', 'g')) IN (
  'minshewsmaniacs',
  'gardnersghost',
  'k9minshewii'
);

UPDATE rivalry_pairs
SET team_b_id = 'Cascade Marauders'
WHERE lower(regexp_replace(team_b_id, '[^a-z0-9]+', '', 'g')) IN (
  'minshewsmaniacs',
  'gardnersghost',
  'k9minshewii'
);
