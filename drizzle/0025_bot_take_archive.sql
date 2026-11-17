-- Additive, idempotent character history. Nothing is dropped or rewritten.
CREATE TABLE IF NOT EXISTS bot_take_archive (
  bot bot_name NOT NULL,
  season integer NOT NULL,
  receipt_id text NOT NULL,
  source_newsletter_id text NOT NULL,
  published_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bot, season, receipt_id)
);
CREATE INDEX IF NOT EXISTS bot_take_archive_issue_idx ON bot_take_archive (season, source_newsletter_id);
CREATE INDEX IF NOT EXISTS bot_take_archive_date_idx ON bot_take_archive (bot, season, published_at, receipt_id);

-- Seed each host from their retained source-ledger records only once.
INSERT INTO bot_take_archive (bot,season,receipt_id,source_newsletter_id,published_at,payload)
SELECT b.bot,b.season,e.value->>'id',e.value->>'sourceNewsletterId',
       COALESCE(NULLIF(e.value->>'publishedAt','')::timestamptz,b.updated_at),e.value
FROM bot_memory b
CROSS JOIN LATERAL jsonb_array_elements(
 CASE WHEN jsonb_typeof(b.enhanced_data->'publishedTakeLedgerState'->'entries')='array'
 THEN b.enhanced_data->'publishedTakeLedgerState'->'entries'
 WHEN jsonb_typeof(b.enhanced_data->'publishedTakeLedger')='array'
 THEN b.enhanced_data->'publishedTakeLedger'
 ELSE '[]'::jsonb END
) e
WHERE NULLIF(e.value->>'id','') IS NOT NULL AND NULLIF(e.value->>'sourceNewsletterId','') IS NOT NULL
ON CONFLICT (bot,season,receipt_id) DO NOTHING;
