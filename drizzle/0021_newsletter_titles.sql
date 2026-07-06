-- Newsletter catalog: allow multiple saved newsletters and give them titles.
-- Title is auto-generated on save and renameable from the admin UI; existing rows
-- fall back to a computed display title in code when title IS NULL.
ALTER TABLE "newsletters" ADD COLUMN IF NOT EXISTS "title" varchar(200);
