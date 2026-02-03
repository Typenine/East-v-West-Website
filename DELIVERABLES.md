# Deliverables: Suggestion Title & Ballot Override

## Files Changed

### Production Code (6 files)
1. **`src/server/db/queries.fixed.ts`** (+35 lines)
   - Added `ensureBallotForcedColumn()`
   - Added `setBallotForced(id, forced)`
   - Added `getBallotForcedMap()`

2. **`src/app/api/suggestions/route.ts`** (+11 lines)
   - Added `ballotForced` to Suggestion type
   - Imported `getBallotForcedMap`
   - Added ballot forced overlay in GET handler

3. **`src/app/api/admin/suggestions/route.ts`** (+12 lines)
   - Added `ballotForced` parameter parsing
   - Imported `setBallotForced`
   - Added ballot forced update logic
   - Returns `ballotForced` in response

4. **`src/app/admin/suggestions/page.tsx`** (+20 lines)
   - Added `ballotForced` to Suggestion type
   - Added toggle button UI: "🗳️ Add to Ballot" / "🗳️ Remove from Ballot"
   - Blue visual feedback when forced
   - Optimistic UI update on click

5. **`src/app/suggestions/page.tsx`** (+3 lines)
   - Added `ballotForced` to Suggestion type
   - Updated ballot queue filter: `isBallotEligible = eligible >= 3 OR ballotForced`
   - Maintained finalized and vague exclusions

6. **`src/app/suggestions/[id]/page.tsx`** (+1 line)
   - Added `ballotForced` to Suggestion type (consistency)

### Documentation (4 files)
7. **`TESTING.md`** (97 lines)
   - Part A: Title saving test procedures
   - Part B: Ballot override test scenarios
   - API endpoint examples
   - Database verification queries

8. **`IMPLEMENTATION_NOTES.md`** (165 lines)
   - Technical architecture details
   - Database changes explained
   - API modifications documented
   - Security considerations
   - Rollback procedures

9. **`UI_CHANGES_VISUAL.md`** (254 lines)
   - ASCII mockups of UI changes
   - Button state illustrations
   - Interaction flow diagrams
   - Edge case scenarios
   - Discord behavior examples

10. **`SUMMARY.md`** (254 lines)
    - Executive summary
    - Implementation overview
    - Deployment checklist
    - Success criteria
    - Support resources

## How to Test

### Part A: Title Saving (Already Working)

#### Test 1: Save Title
1. Go to `/admin/suggestions`
2. Find a suggestion without a title
3. Type "Test Title" in the Title input
4. Click outside the input (blur event)
5. **Expected**: Title saves, input shows "Test Title"
6. Refresh page
7. **Expected**: Title persists

#### Test 2: Public Display
1. Go to `/suggestions`
2. Find the suggestion with "Test Title"
3. **Expected**: Shows "Test Title" instead of "Suggestion 00XX"
4. Click the suggestion to go to detail page
5. **Expected**: Page header shows "Test Title"

#### Test 3: Ballot Queue Display
1. Go to `/suggestions`
2. Scroll to Ballot Queue section
3. Find suggestions with titles
4. **Expected**: Shows title when present, "Suggestion 00XX" when not

### Part B: Ballot Override (Newly Implemented)

#### Test 1: Force Add to Ballot
1. Go to `/admin/suggestions`
2. Find a suggestion with <3 endorsements
3. Click "🗳️ Add to Ballot" button
4. **Expected**: Button turns blue, says "🗳️ Remove from Ballot"
5. Go to `/suggestions`
6. Check Ballot Queue section
7. **Expected**: Forced suggestion appears in queue

#### Test 2: Force Remove from Ballot
1. In admin UI, click "🗳️ Remove from Ballot" (blue button)
2. **Expected**: Button reverts to normal, says "🗳️ Add to Ballot"
3. Go to `/suggestions`
4. Check Ballot Queue section
5. **Expected**: Suggestion removed from queue (if <3 endorsements)

#### Test 3: Finalized Exclusion
1. In admin UI, set suggestion to "Vote Passed"
2. Click "🗳️ Add to Ballot" (force it)
3. **Expected**: Button turns blue
4. Go to `/suggestions`
5. **Expected**: Finalized suggestion does NOT appear in queue

#### Test 4: Endorsement-Based Inclusion
1. Find a suggestion with 3+ endorsements
2. **Expected**: Appears in Ballot Queue (regardless of force status)
3. In admin, click "🗳️ Remove from Ballot" (if forced)
4. **Expected**: Still appears in queue (has enough endorsements)

#### Test 5: Discord Behavior
1. **Setup**: Find suggestion with 2 endorsements, not forced
2. In admin, click "🗳️ Add to Ballot"
3. **Expected**: No Discord webhook fires
4. Log in as a team, endorse the suggestion (3rd endorsement)
5. **Expected**: Discord "Ballot Eligible" webhook fires
6. Check Discord channel
7. **Expected**: Only one "Ballot Eligible" message

### API Testing

#### Test 1: Get Suggestions (includes ballotForced)
```bash
curl http://localhost:3000/api/suggestions
# Expected: JSON array with ballotForced field
# Example: { "id": "...", "ballotForced": true, ... }
```

#### Test 2: Update Ballot Forced (Admin)
```bash
curl -X PUT http://localhost:3000/api/admin/suggestions \
  -H "Content-Type: application/json" \
  -H "Cookie: evw_admin=YOUR_SECRET" \
  -d '{"id":"SUGGESTION_ID","ballotForced":true}'
# Expected: { "ok": true, "ballotForced": true, ... }
```

#### Test 3: Update Title (Admin)
```bash
curl -X PUT http://localhost:3000/api/admin/suggestions \
  -H "Content-Type: application/json" \
  -H "Cookie: evw_admin=YOUR_SECRET" \
  -d '{"id":"SUGGESTION_ID","title":"New Title"}'
# Expected: { "ok": true, "title": "New Title", ... }
```

### Database Verification

#### Check Ballot Forced Column Exists
```sql
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'suggestions' 
  AND column_name = 'ballot_forced';
-- Expected: One row showing integer type, default 0
```

#### List Forced Suggestions
```sql
SELECT id, title, ballot_forced, vote_tag 
FROM suggestions 
WHERE ballot_forced = 1;
-- Expected: Shows all suggestions admin has forced
```

#### Verify Title Persistence
```sql
SELECT id, title 
FROM suggestions 
WHERE title IS NOT NULL 
ORDER BY created_at DESC 
LIMIT 10;
-- Expected: Shows recent suggestions with titles
```

## Expected Behaviors Summary

### Title Saving
✅ Title input saves on blur
✅ API returns `{ ok: true, title: "..." }`
✅ Titles persist after page refresh
✅ Public pages show title or "Suggestion 00XX"
✅ Ballot queue uses title when present

### Ballot Forced Toggle
✅ Button toggles between "Add to Ballot" and "Remove from Ballot"
✅ Blue visual feedback when forced
✅ Instant UI update (optimistic)
✅ API persists change to database
✅ Public ballot queue updates accordingly

### Ballot Queue Logic
✅ Shows suggestions with: (3+ endorsements OR forced) AND NOT finalized
✅ Excludes finalized suggestions (vote_passed/vote_failed)
✅ Excludes vague suggestions (needs clarification)
✅ No visual indication of "forced" status to public

### Discord Webhooks
✅ Fires when endorsement threshold reached (2→3)
✅ Does NOT fire when admin forces to ballot
✅ Prevents duplicate notifications (ballot_eligible_notified flag)
✅ Only fires once per suggestion crossing threshold

## Error Handling

### Database Errors
- Column creation wrapped in try/catch
- Safe to run multiple times (IF NOT EXISTS)
- Returns false on failure, doesn't throw

### API Errors
- Returns 403 if not admin (unauthorized)
- Returns 400 if invalid parameters
- Returns 500 if database operation fails

### UI Errors
- Button disabled while saving (prevents double-click)
- Optimistic update reverts if API fails
- Error states logged to console

## Rollback Procedure

If issues arise:

### 1. Disable All Forced Suggestions
```sql
UPDATE suggestions SET ballot_forced = 0 WHERE ballot_forced = 1;
```

### 2. Revert Code Changes
```bash
git revert HEAD
git push origin main
```

### 3. Optional: Drop Column
```sql
ALTER TABLE suggestions DROP COLUMN IF EXISTS ballot_forced;
```

## Support Resources

- **TESTING.md** - Detailed testing procedures
- **IMPLEMENTATION_NOTES.md** - Technical documentation
- **UI_CHANGES_VISUAL.md** - Visual mockups and flows
- **SUMMARY.md** - Executive summary and deployment guide

## Contact

For questions or issues during testing:
1. Check the documentation files listed above
2. Verify database column exists and has correct type
3. Check browser console for errors
4. Check server logs for API errors
5. Verify admin cookie is set correctly
