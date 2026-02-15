# Testing Guide for Suggestion Title & Ballot Override

## Part A: Title Saving (Already Implemented)

### How to Test:
1. **Navigate to Admin UI**: Go to `/admin/suggestions`
2. **Edit a Title**: 
   - Find a suggestion without a title
   - Type a title in the "Title" input field
   - Click outside the input (blur event triggers save)
3. **Verify Persistence**: 
   - Refresh the page - title should remain
   - Go to `/suggestions` - title should display instead of "Suggestion 00XX"
4. **Test Public Display**:
   - Navigate to `/suggestions` to see the suggestions list
   - Ballot queue should show titles when present
   - Items without titles show "Suggestion 0001" format

### Expected Behavior:
- Title input saves on blur
- API returns `{ ok: true, title: "..." }` on success
- Public pages show title or fallback to "Suggestion 00XX"

## Part B: Ballot Forced Override (Newly Implemented)

### How to Test:

#### 1. Force Add to Ballot
1. **Navigate to Admin UI**: Go to `/admin/suggestions`
2. **Find a Suggestion**: Pick one that doesn't have 3 endorsements
3. **Click "🗳️ Add to Ballot"** button
4. **Verify**:
   - Button should turn blue and say "🗳️ Remove from Ballot"
   - Go to `/suggestions` and check Ballot Queue section
   - The forced suggestion should appear in the ballot queue

#### 2. Remove from Ballot
1. **Click "🗳️ Remove from Ballot"** on a forced suggestion
2. **Verify**:
   - Button reverts to normal style and says "🗳️ Add to Ballot"
   - Go to `/suggestions` - suggestion removed from ballot queue

#### 3. Verify Finalized Exclusion
1. **Set a suggestion to "Vote Passed"** or "Vote Failed" in admin UI
2. **Force add to ballot** (click "🗳️ Add to Ballot")
3. **Verify**: Go to `/suggestions` - finalized suggestions should NOT appear in ballot queue even if forced

#### 4. Verify Discord Behavior
1. **Force add a suggestion to ballot** (using admin button)
2. **Verify**: No Discord webhook should fire
3. **Add endorsements to reach threshold** (3 endorsements)
4. **Verify**: Discord webhook should fire with "Ballot Eligible" message

### Expected Behavior:
- Ballot forced toggle works instantly
- Ballot queue shows items with: (3+ endorsements OR ballotForced) AND NOT finalized
- Discord webhook only fires when endorsement threshold reached
- Discord does NOT fire when admin forces to ballot

## API Endpoints

### Title Update:
```bash
PUT /api/admin/suggestions
{
  "id": "suggestion-uuid",
  "title": "My New Title"
}
```

### Ballot Forced Update:
```bash
PUT /api/admin/suggestions
{
  "id": "suggestion-uuid",
  "ballotForced": true
}
```

### Get Suggestions (includes ballotForced):
```bash
GET /api/suggestions
# Response includes: { id, title, ballotForced, ... }
```

## Database Changes

### New Column:
```sql
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS ballot_forced integer DEFAULT 0 NOT NULL;
```

### Query to Check:
```sql
SELECT id, title, ballot_forced FROM suggestions WHERE ballot_forced = 1;
```
