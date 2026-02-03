# Visual Guide to UI Changes

## Admin UI - New Ballot Toggle Button

### Before (Without Ballot Override):
```
┌─────────────────────────────────────────────────────────────┐
│ Admin • Suggestions Votes                                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ Jan 15, 2025, 3:45 PM                              [Rules]   │
│                                                               │
│ Add a new trading block feature to allow teams...            │
│                                                               │
│ TITLE                                                         │
│ [Add Trading Block Feature_____________________]             │
│                                                               │
│ PROPOSED BY [TeamA ▾]  SPONSOR [TeamB ▾]  VOTE TAG [—None▾] │
│                                                               │
│ [Mark Needs Clarification] [✔ Added] [Delete]                │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### After (With Ballot Override):
```
┌─────────────────────────────────────────────────────────────┐
│ Admin • Suggestions Votes                                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ Jan 15, 2025, 3:45 PM                              [Rules]   │
│                                                               │
│ Add a new trading block feature to allow teams...            │
│                                                               │
│ TITLE                                                         │
│ [Add Trading Block Feature_____________________]             │
│                                                               │
│ PROPOSED BY [TeamA ▾]  SPONSOR [TeamB ▾]  VOTE TAG [—None▾] │
│                                                               │
│ [Mark Needs Clarification] [🗳️ Add to Ballot] [✔ Added] [Delete] │  ← NEW BUTTON
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### After Clicking "Add to Ballot" (Button turns blue):
```
┌─────────────────────────────────────────────────────────────┐
│ Admin • Suggestions Votes                                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ Jan 15, 2025, 3:45 PM                              [Rules]   │
│                                                               │
│ Add a new trading block feature to allow teams...            │
│                                                               │
│ TITLE                                                         │
│ [Add Trading Block Feature_____________________]             │
│                                                               │
│ PROPOSED BY [TeamA ▾]  SPONSOR [TeamB ▾]  VOTE TAG [—None▾] │
│                                                               │
│ [Mark Needs Clarification] [🗳️ Remove from Ballot] [✔ Added] [Delete] │  ← BLUE BUTTON
│                                  ▲                            │
│                            (Blue background)                  │
└─────────────────────────────────────────────────────────────┘
```

## Public UI - Ballot Queue Changes

### Before (Only endorsement-based):
```
┌─────────────────────────────────────────────────────────────┐
│ 🗳️ Ballot Queue                                              │
├─────────────────────────────────────────────────────────────┤
│ These suggestions have reached 3 endorsements and are        │
│ eligible for voting.                                         │
│                                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Add Trading Block Feature                      [VOTING] │ │
│ │ Allow teams to mark players as available...             │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Suggestion 0042                                         │ │
│ │ Improve the Discord webhook notification system...      │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### After (With forced suggestions):
```
┌─────────────────────────────────────────────────────────────┐
│ 🗳️ Ballot Queue                                              │
├─────────────────────────────────────────────────────────────┤
│ These suggestions have reached 3 endorsements and are        │
│ eligible for voting.                                         │
│                                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Add Trading Block Feature                      [VOTING] │ │
│ │ Allow teams to mark players as available...             │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Suggestion 0042                                         │ │  ← Has 3+ endorsements
│ │ Improve the Discord webhook notification system...      │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Emergency Rule Clarification                            │ │  ← FORCED BY ADMIN
│ │ Clarify the deadline for weekly transactions...         │ │     (only 1 endorsement)
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Button States Visual

### Normal State (Not Forced):
```
┌─────────────────────┐
│ 🗳️ Add to Ballot    │  ← Gray border, normal text
└─────────────────────┘
```

### Forced State (Active):
```
┌─────────────────────┐
│ 🗳️ Remove from Ballot│  ← Blue background, white text
└─────────────────────┘
    (Blue #3b82f6)
```

### Disabled State (While Saving):
```
┌─────────────────────┐
│ 🗳️ Add to Ballot    │  ← Grayed out, not clickable
└─────────────────────┘
   (Cursor: not-allowed)
```

## Interaction Flow

### Force Add Flow:
```
1. Admin clicks "🗳️ Add to Ballot"
   ↓
2. Button immediately updates to blue "🗳️ Remove from Ballot"
   ↓
3. API call: PUT /api/admin/suggestions { ballotForced: true }
   ↓
4. Success → Button stays blue
   ↓
5. User navigates to /suggestions
   ↓
6. Suggestion appears in Ballot Queue (even with <3 endorsements)
```

### Force Remove Flow:
```
1. Admin clicks "🗳️ Remove from Ballot" (blue button)
   ↓
2. Button immediately reverts to normal "🗳️ Add to Ballot"
   ↓
3. API call: PUT /api/admin/suggestions { ballotForced: false }
   ↓
4. Success → Button stays normal
   ↓
5. User navigates to /suggestions
   ↓
6. Suggestion removed from Ballot Queue (if <3 endorsements)
```

## Edge Cases Handled

### Case 1: Finalized Suggestion
```
Suggestion has ballotForced = true
Suggestion has voteTag = "vote_passed"

Result: Does NOT appear in Ballot Queue
Reason: Finalized suggestions excluded regardless of force
```

### Case 2: Vague Suggestion
```
Suggestion has ballotForced = true
Suggestion has vague = true

Result: Does NOT appear in Ballot Queue
Reason: Vague suggestions need clarification first
```

### Case 3: Both Forced and Eligible
```
Suggestion has ballotForced = true
Suggestion has 4 endorsements (>= 3)

Result: Appears in Ballot Queue
Reason: Meets both criteria
Note: If admin removes force, still appears (has endorsements)
```

## Discord Behavior

### Scenario 1: Admin Forces to Ballot
```
Initial state: 0 endorsements
Admin action: Clicks "🗳️ Add to Ballot"

Discord webhook: ❌ Does NOT fire
Ballot Queue: ✅ Shows suggestion
```

### Scenario 2: Endorsement Threshold Reached
```
Initial state: 2 endorsements
User action: Adds 3rd endorsement
System: markBallotEligibleIfThreshold() returns becameEligible = true

Discord webhook: ✅ Fires "Ballot Eligible" message
Ballot Queue: ✅ Shows suggestion
```

### Scenario 3: Admin Forces, Then Threshold Reached
```
Step 1: Admin forces (0 endorsements)
  → Discord: ❌ No webhook
  → Ballot: ✅ Shows

Step 2: Users add 3 endorsements
  → Discord: ✅ Fires "Ballot Eligible" message
  → Ballot: ✅ Still shows (now meets both criteria)
```

## CSS Classes Used

### Button Base:
```css
text-sm px-3 py-1 rounded border
```

### Normal State:
```css
border-[var(--border)]
```

### Forced State:
```css
bg-blue-600 text-white border-blue-600
```

### Disabled State:
```css
disabled={busy === s.id}
```
