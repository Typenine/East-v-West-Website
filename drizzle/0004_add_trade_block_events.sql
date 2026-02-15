CREATE TABLE IF NOT EXISTS "trade_block_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team" varchar(255) NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"asset_type" varchar(32),
	"asset_id" varchar(255),
	"asset_label" text,
	"old_wants" text,
	"new_wants" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp
);

CREATE INDEX IF NOT EXISTS "trade_block_events_team_created_idx" ON "trade_block_events" USING btree ("team","created_at");
CREATE INDEX IF NOT EXISTS "trade_block_events_sent_at_idx" ON "trade_block_events" USING btree ("sent_at");
