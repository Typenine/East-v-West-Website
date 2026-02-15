# Testing Suggestions Webhooks

This document provides reproducible test paths for both Clancy Discord webhook events.

## Prerequisites

1. Ensure `DISCORD_SUGGESTIONS_WEBHOOK_URL` is set in your environment
2. Ensure `SITE_URL` is set (e.g., `https://your-domain.com`)
3. Have access to the Discord channel where webhooks are posted
4. Be logged in as a team user

## Event 1: New Suggestion Created

### Test Path

1. Navigate to `/suggestions`
2. Click "New Suggestion" button
3. Fill out the form:
   - **Title**: "Test Suggestion Title"
   - **Category**: Select any category (e.g., "League Rules")
   - **Content**: "This is a test suggestion"
   - Check "Endorse this suggestion"
4. Submit the form

### Expected Discord Message

**Plain text (top level):**
```
📋 **New Suggestion: Test Suggestion Title**
https://your-domain.com/suggestions/{suggestion-id}
```

**Embed:**
- **Title**: 📋 Test Suggestion Title
- **Description**:
  - **Category:** League Rules
  - **Proposed by:** {Your Team Name}
  - 🔗 **[View Suggestion](https://your-domain.com/suggestions/{suggestion-id})**
- **Color**: Blue (0x3b82f6)
- **Timestamp**: Creation time

### Verification Checklist
- [ ] Message includes suggestion title
- [ ] Message includes category
- [ ] Message includes proposer team name
- [ ] Link is present and correct
- [ ] Link works when clicked
- [ ] Only one message is posted (no duplicates)

---

## Event 2: Suggestion Reaches Ballot Threshold

### Test Path

**Setup:**
1. Create a new suggestion as Team A (following Event 1 steps)
2. Note the suggestion ID from the URL

**Reach Threshold:**
1. Log in as Team B
2. Navigate to the suggestion detail page
3. Click "Endorse" button
4. Log in as Team C
5. Navigate to the same suggestion
6. Click "Endorse" button
7. Log in as Team D
8. Navigate to the same suggestion
9. Click "Endorse" button ← **This should trigger the webhook**

### Expected Discord Message

**Plain text (top level):**
```
🗳️ **Ballot Eligible: Test Suggestion Title** (3/3 endorsements)
https://your-domain.com/suggestions/{suggestion-id}
```

**Embed:**
- **Title**: 🗳️ Ballot Eligible: Test Suggestion Title
- **Description**:
  - **This suggestion has reached the ballot!**
  - **Endorsements:** 3/3 (threshold met)
  - **Category:** League Rules
  - **Proposed by:** {Team A Name}
  - 🔗 **[View Suggestion](https://your-domain.com/suggestions/{suggestion-id})**
- **Color**: Green (0x16a34a)
- **Timestamp**: When threshold was reached

### Verification Checklist
- [ ] Message includes suggestion title (identifies which suggestion)
- [ ] Message shows endorsement count (3/3)
- [ ] Message shows threshold (3)
- [ ] Message includes category
- [ ] Message includes proposer team name
- [ ] Link is present and correct
- [ ] Link works when clicked
- [ ] **Only one message is posted** (even if more endorsements are added)
- [ ] No duplicate messages if endorsements fluctuate (remove and re-add)

---

## Important Notes

### Endorsement Rules
- **Proposer cannot endorse their own suggestion** (blocked by backend)
- Endorsement count **excludes proposer's endorsement** (if it exists)
- Threshold is **3 legal endorsements** (not counting proposer)
- UI should hide endorse button for proposer

### Deduplication
- New suggestion: Uses in-memory `Set` to prevent duplicates (resets on server restart)
- Ballot eligible: Uses database flag `ballot_eligible_notified` (permanent deduplication)
- Ballot eligible message posts **only once** when crossing threshold
- If endorsements drop below 3 and rise again, no new message is sent

### Troubleshooting

**No webhook message appears:**
1. Check server logs for webhook errors: `[suggestions] Discord webhook failed` or `[endorse] ballot webhook failed`
2. Verify `DISCORD_WEBHOOK_URL` environment variable is set
3. Check Discord webhook URL is valid and channel exists
4. Verify rate limiting isn't blocking (429 status)

**Wrong endorsement count:**
1. Verify proposer endorsements are excluded
2. Check `getSuggestionEndorsementsMap` query excludes proposer
3. Verify `markBallotEligibleIfThreshold` counts correctly

**Link doesn't work:**
1. Verify `SITE_URL` environment variable is set correctly
2. Check suggestion ID is valid UUID
3. Ensure suggestion detail page route exists at `/suggestions/[id]`

**Duplicate messages:**
1. For new suggestions: Server restart clears in-memory Set
2. For ballot eligible: Check `ballot_eligible_notified` flag in database
3. Verify atomic update in `markBallotEligibleIfThreshold` is working

---

## Database Verification

### Check endorsement count (excluding proposer):
```sql
SELECT 
  s.id,
  s.proposer_team,
  COUNT(e.team) as legal_endorsements
FROM suggestions s
LEFT JOIN suggestion_endorsements e ON e.suggestion_id = s.id
WHERE s.id = '{suggestion-id}'
  AND (s.proposer_team IS NULL OR e.team <> s.proposer_team)
GROUP BY s.id, s.proposer_team;
```

### Check ballot notification status:
```sql
SELECT 
  id,
  ballot_eligible_notified,
  ballot_eligible_at
FROM suggestions
WHERE id = '{suggestion-id}';
```

### Reset ballot notification (for re-testing):
```sql
UPDATE suggestions
SET ballot_eligible_notified = 0,
    ballot_eligible_at = NULL
WHERE id = '{suggestion-id}';
```
