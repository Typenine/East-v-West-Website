# Clancy Trade Block Reporter

A batched Discord notification system that posts Schefter-style trade block updates when teams make changes.

## Overview

The Trade Block Reporter captures changes to team trade blocks and posts consolidated updates to Discord in a professional sports reporter style. Changes are batched with a 120-second window to avoid spam and ensure multiple edits are combined into a single message.

## Features

- **Persistent Event Queue**: Events stored in database, not in-memory (serverless-safe)
- **120-Second Batching**: Groups changes within 120s window per team
- **Diff Detection**: Tracks added items, removed items, and wants/description changes
- **Schefter-Style Messages**: Concise, factual updates with emoji and formatting
- **Team Grouping**: At most one message per team per batch window
- **Automatic Links**: Includes link back to Trade Block page

## Architecture

### 1. Event Capture (`src/lib/server/trade-block-reporter.ts`)

When a team updates their trade block via `/api/me/trade-block`, the system:
- Compares old vs new trade block arrays
- Detects added/removed players, picks, and FAAB
- Detects changes to "wants" text
- Creates events in `trade_block_events` table with human-readable labels

### 2. Persistent Queue (`src/server/db/schema.ts`)

Events are stored in the `trade_block_events` table:
```sql
- id: uuid (primary key)
- team: varchar (team name)
- eventType: varchar ('added' | 'removed' | 'wants_changed')
- assetType: varchar ('player' | 'pick' | 'faab' | null)
- assetId: varchar (unique identifier for asset)
- assetLabel: text (human-readable, e.g., "Justin Jefferson (WR, MIN)")
- oldWants: text (for wants_changed events)
- newWants: text (for wants_changed events)
- createdAt: timestamp
- sentAt: timestamp (null until posted to Discord)
```

### 3. Batch Flusher (`src/lib/server/trade-block-flusher.ts`)

Processes pending events:
- Queries events older than 120 seconds with `sentAt = null`
- Groups by team
- Merges multiple events into single message per team
- Posts to Discord webhook
- Marks events as sent

### 4. Cron Endpoint (`src/app/api/cron/trade-block-reporter/route.ts`)

Triggers the batch flush:
- Called by external cron service (e.g., Vercel Cron, GitHub Actions)
- Protected by `CRON_SECRET` authorization header
- Returns stats: `{ processed, sent, timestamp }`

## Setup

### 1. Environment Variables

Add to `.env.local`:
```bash
# Discord webhook for trade block updates
DISCORD_TRADE_BLOCK_WEBHOOK_URL=https://discord.com/api/webhooks/1472419947346133023/pFDzEk4ItK4YkFHAs8wDddiftIRBf1AMh6jS9Tx0CK2pft_MXahP20TdqJZI3OoW-E2H

# Site URL for links in messages
SITE_URL=https://eastvswest.win

# Optional: protect cron endpoint
CRON_SECRET=your-secret-here
```

### 2. Database Migration

Run migration to create `trade_block_events` table:
```bash
npm run db:push
# or
npx drizzle-kit push
```

### 3. Cron Setup

Configure a cron job to call the endpoint every 2 minutes:

**Vercel Cron** (`vercel.json`):
```json
{
  "crons": [
    {
      "path": "/api/cron/trade-block-reporter",
      "schedule": "*/2 * * * *"
    }
  ]
}
```

**GitHub Actions** (`.github/workflows/trade-block-cron.yml`):
```yaml
name: Trade Block Reporter
on:
  schedule:
    - cron: '*/2 * * * *'
jobs:
  flush:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger flush
        run: |
          curl -X GET "${{ secrets.SITE_URL }}/api/cron/trade-block-reporter" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

## Message Format

Schefter-style narrative format with "per sources" attribution:

**Example 1 (additions only):**
```
The Badgers have added Justin Jefferson (WR, MIN) and 2025 Round 2 (Badgers) to their trade block, per sources.

https://eastvswest.win/trades
```

**Example 2 (removals only):**
```
The Badgers have removed Saquon Barkley (RB, NYG) from their trade block, per sources.

https://eastvswest.win/trades
```

**Example 3 (both additions and removals):**
```
The Badgers have updated their trade block, adding Justin Jefferson (WR, MIN) and 2025 Round 2 (Badgers) while removing Saquon Barkley (RB, NYG), per sources.

https://eastvswest.win/trades
```

**Example 4 (with wants change):**
```
The Badgers have added Justin Jefferson (WR, MIN) to their trade block, per sources. Sources indicate the team is looking for: Young RBs, 2026 1st round picks.

https://eastvswest.win/trades
```

## Testing

### Manual Test Flow

1. **Make trade block changes** (within 120 seconds):
   - Navigate to `/trade-block` (must be logged in)
   - Add a player to your trade block
   - Wait 10 seconds
   - Remove a different player
   - Update your "Looking For" text
   - Save changes

2. **Wait 120+ seconds** for batch window to close

3. **Trigger the cron endpoint**:
   ```bash
   curl http://localhost:3000/api/cron/trade-block-reporter \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```

4. **Check Discord** for a single combined message with all changes

### Expected Behavior

✅ **Correct**:
- Multiple changes within 120s → **one message** after window closes
- Message includes all added/removed items
- Message includes wants change if applicable
- Link to `/trades` page works

❌ **Incorrect**:
- Multiple messages for same team in same batch
- Messages posted before 120s window
- Missing changes from the batch
- Events reprocessed after being sent

### Database Inspection

Check pending events:
```sql
SELECT * FROM trade_block_events 
WHERE sent_at IS NULL 
ORDER BY team, created_at;
```

Check sent events:
```sql
SELECT team, COUNT(*) as event_count, MAX(sent_at) as last_sent
FROM trade_block_events 
WHERE sent_at IS NOT NULL
GROUP BY team
ORDER BY last_sent DESC;
```

## Troubleshooting

### Events not being created
- Check `/api/me/trade-block` PUT endpoint logs
- Verify `captureTradeBlockChanges()` is being called
- Check for errors in server logs

### Events not being sent
- Verify cron job is running every 2 minutes
- Check `DISCORD_TRADE_BLOCK_WEBHOOK_URL` is set correctly
- Verify events are older than 120 seconds
- Check Discord webhook is valid (test with curl)

### Duplicate messages
- Check if cron is running too frequently (should be 2min)
- Verify `sentAt` is being set correctly after posting
- Check for race conditions if multiple cron instances

### Missing player names
- Verify Sleeper player cache is populated
- Check `getAllPlayersCached()` is working
- Fallback shows `Player {playerId}` if name lookup fails

## Implementation Notes

### Why 120 seconds?
- Gives users time to make multiple edits without spam
- Long enough to batch related changes
- Short enough to feel timely

### Why persistent queue?
- Serverless functions are stateless
- In-memory timers don't survive cold starts
- Database ensures events aren't lost

### Why team grouping?
- Prevents spam when multiple teams update simultaneously
- Each team gets their own focused message
- Easier to read and follow in Discord

### Asset identification
- Players: `player:{playerId}`
- Picks: `pick:{year}-{round}-{originalTeam}`
- FAAB: `faab:{amount}`
- Ensures accurate diff detection across updates

## Future Enhancements

Potential improvements:
- [ ] Add position filters to wants changes
- [ ] Include contact method in messages
- [ ] Support for @mentions when specific players added
- [ ] Weekly digest of all trade block activity
- [ ] Analytics on most-traded assets
