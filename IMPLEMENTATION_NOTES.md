# Implementation Notes: Suggestion Title & Ballot Override

## Problem Statement Summary

### Part A: Fix Title Saving
- **Issue**: Title edits not persisting
- **Finding**: Title saving was already fully implemented and working correctly
- **Status**: ✅ No changes needed - already working

### Part B: Add Admin Ballot Override
- **Requirement**: Admin-only ability to force suggestions onto ballot queue
- **Status**: ✅ Fully implemented

## Implementation Details

### Database Changes

#### New Column: `ballot_forced`
```sql
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS ballot_forced integer DEFAULT 0 NOT NULL;
```

- **Type**: Integer (0 = false, 1 = true)
- **Default**: 0 (not forced)
- **Purpose**: Allow admin to override ballot eligibility

### Database Functions Added

1. **`ensureBallotForcedColumn()`**
   - Creates the column if it doesn't exist
   - Safe to call multiple times

2. **`setBallotForced(id: string, forced: boolean)`**
   - Updates the ballot_forced flag for a suggestion
   - Returns true on success

3. **`getBallotForcedMap()`**
   - Returns Record<string, boolean> of forced suggestions
   - Only includes suggestions where ballot_forced = 1

### API Changes

#### Public API (`/api/suggestions`)
- **Added**: `ballotForced` field to Suggestion type
- **Added**: Import of `getBallotForcedMap`
- **Added**: Overlay of ballot forced flags in GET response

#### Admin API (`/api/admin/suggestions`)
- **Added**: `ballotForced` parameter parsing
- **Added**: Call to `setBallotForced()` when ballotForced is provided
- **Added**: Return `ballotForced` in response

### UI Changes

#### Admin UI (`/admin/suggestions/page.tsx`)
- **Added**: `ballotForced` to Suggestion type
- **Added**: Toggle button "🗳️ Add to Ballot" / "🗳️ Remove from Ballot"
- **Visual**: Button turns blue when forced
- **Behavior**: Instant toggle with optimistic UI update

#### Public UI (`/suggestions/page.tsx`)
- **Added**: `ballotForced` to Suggestion type
- **Updated**: Ballot queue filter logic
- **New Logic**: `isBallotEligible = eligibleCount >= 3 OR ballotForced`
- **Maintained**: Exclusion of finalized suggestions (vote_passed/vote_failed)

#### Detail Page (`/suggestions/[id]/page.tsx`)
- **Added**: `ballotForced` to Suggestion type (for consistency)

## Ballot Queue Logic

### Previous Logic:
```typescript
const ballotQueue = items.filter((s) => {
  const eligibleCount = getEligibleCount(s);
  const isFinalized = s.voteTag === 'vote_passed' || s.voteTag === 'vote_failed';
  return eligibleCount >= ENDORSEMENT_THRESHOLD && !isFinalized && !s.vague;
});
```

### New Logic:
```typescript
const ballotQueue = items.filter((s) => {
  const eligibleCount = getEligibleCount(s);
  const isFinalized = s.voteTag === 'vote_passed' || s.voteTag === 'vote_failed';
  const isBallotEligible = eligibleCount >= ENDORSEMENT_THRESHOLD || s.ballotForced;
  return isBallotEligible && !isFinalized && !s.vague;
});
```

### Key Points:
1. Suggestions appear in ballot queue if:
   - They have 3+ eligible endorsements, OR
   - Admin has forced them (ballotForced = true)
2. Suggestions are excluded if:
   - They are finalized (vote_passed or vote_failed)
   - They are marked vague (needs clarification)

## Discord Webhook Behavior

### Unchanged ✅
Discord "Ballot Eligible" webhook behavior remains unchanged:
- Fires only when endorsements reach threshold (2→3)
- Does NOT fire when admin forces to ballot
- Implementation in `/api/me/suggestions/endorse/route.ts`
- Uses `markBallotEligibleIfThreshold()` for atomic check

### Why No Changes Needed:
The Discord notification logic is tied to the endorsement threshold being reached, not the ballot queue itself. The `markBallotEligibleIfThreshold()` function:
1. Checks if eligible endorsements >= 3
2. Atomically sets `ballot_eligible_notified = 1` if threshold crossed
3. Fires Discord webhook only if `becameEligible = true`

Admin forcing a suggestion to ballot doesn't trigger this flow, so no duplicate notifications.

## Migration Strategy

### Column Creation:
- Uses `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- Safe to run multiple times
- Backwards compatible (default 0)

### Existing Data:
- All existing suggestions have `ballot_forced = 0` by default
- No data migration needed
- No breaking changes

## Security Considerations

### Admin-Only:
- `setBallotForced()` only called from admin API
- Admin API checks `isAdmin()` before any operation
- Requires `evw_admin` cookie with correct secret

### Public API:
- Public API only reads `ballotForced` flag
- No way for non-admins to modify

## Testing Verification

See `TESTING.md` for detailed test procedures.

### Quick Smoke Test:
1. Go to `/admin/suggestions`
2. Click "🗳️ Add to Ballot" on any suggestion
3. Go to `/suggestions`
4. Verify suggestion appears in Ballot Queue
5. Go back to admin, click "🗳️ Remove from Ballot"
6. Verify suggestion removed from ballot queue

## Rollback Plan

If issues arise, the feature can be disabled by:

### Database:
```sql
UPDATE suggestions SET ballot_forced = 0 WHERE ballot_forced = 1;
```

### Code:
Revert the changes to:
1. Ballot queue filter logic in `/app/suggestions/page.tsx`
2. Admin UI button in `/app/admin/suggestions/page.tsx`

The column can remain in place (harmless if not used).
