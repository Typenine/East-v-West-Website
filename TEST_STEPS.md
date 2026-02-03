# Test Steps for Suggestion Headers and Display Numbers

## Prerequisites
- Database connection available (DATABASE_URL set)
- Admin access configured (EVW_ADMIN_SECRET cookie)

## Test Plan

### 1. Database Migration and Backfill
**Objective**: Verify display numbers are assigned to existing suggestions

```bash
# Start the dev server
npm run dev

# Check database state before
SELECT id, title, display_number, created_at FROM suggestions ORDER BY created_at ASC LIMIT 10;

# Access any suggestions page to trigger backfill
curl http://localhost:3000/api/suggestions

# Check database state after
SELECT id, title, display_number, created_at FROM suggestions ORDER BY display_number ASC LIMIT 10;
```

**Expected Results**:
- Existing suggestions get display_number values
- Numbers assigned in order: oldest suggestion = 1, newest = max
- Ties broken by ID (alphabetical)

### 2. New Suggestion Creation
**Objective**: Verify new suggestions get sequential numbers

**Steps**:
1. Navigate to `/suggestions`
2. Create a new suggestion with title "Test Suggestion A"
3. Create another suggestion with title "Test Suggestion B"
4. Query database: `SELECT id, title, display_number FROM suggestions ORDER BY display_number DESC LIMIT 5;`

**Expected Results**:
- Test Suggestion A gets displayNumber = (previous_max + 1)
- Test Suggestion B gets displayNumber = (previous_max + 2)
- No duplicate display numbers

### 3. Public UI - Ballot Queue Display
**Objective**: Verify suggestions display correctly in ballot queue

**Steps**:
1. Navigate to `/suggestions`
2. Scroll to "Ballot Queue" section
3. Observe suggestion labels

**Expected Results**:
- Suggestions with titles show: title text
- Suggestions without titles show: "Suggestion 0001" format (4-digit padded)
- Old suggestions without display_number show: "Suggestion #abc12345" (ID fragment)

### 4. Public UI - Suggestion Detail Page
**Objective**: Verify individual suggestion page header

**Steps**:
1. Navigate to `/suggestions`
2. Click on a suggestion
3. Observe page header

**Expected Results**:
- Page title shows suggestion title if present
- Page title shows "Suggestion ####" if no title but has displayNumber
- Page title shows "Suggestion #id" as fallback

### 5. Admin UI - Title Editing
**Objective**: Verify admin can set/edit titles for any suggestion

**Steps**:
1. Log in as admin
2. Navigate to `/admin/suggestions`
3. Find a suggestion without a title
4. Type a title in the "Title" input field
5. Click outside the input (blur event)
6. Refresh the page
7. Navigate to `/suggestions` to verify public display

**Expected Results**:
- Input field shows current title or is empty
- On blur, title is saved (API call to PUT /api/admin/suggestions)
- After refresh, title persists
- Public page now shows the new title instead of "Suggestion ####"

### 6. Admin UI - Clear Title
**Objective**: Verify admin can remove titles

**Steps**:
1. Navigate to `/admin/suggestions`
2. Find a suggestion with a title
3. Clear the title input field (delete all text)
4. Click outside the input
5. Navigate to `/suggestions`

**Expected Results**:
- Title is cleared in database
- Public page shows "Suggestion ####" format with display number
- Display number remains stable (doesn't change)

### 7. Concurrent Creation Test (Optional)
**Objective**: Verify atomic assignment prevents duplicates

**Prerequisites**: Node.js and ability to run scripts

**Steps**:
```javascript
// test-concurrent-create.js
async function createSuggestion(text) {
  const res = await fetch('http://localhost:3000/api/suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: text, category: 'Website', title: text })
  });
  return res.json();
}

// Create 10 suggestions concurrently
const promises = Array.from({ length: 10 }, (_, i) => 
  createSuggestion(`Concurrent test ${i}`)
);

const results = await Promise.all(promises);
console.log('Created suggestions:', results.map(r => ({ id: r.id, displayNumber: r.displayNumber })));

// Verify no duplicates
const numbers = results.map(r => r.displayNumber).filter(Boolean);
const unique = new Set(numbers);
console.log(`Created ${numbers.length} suggestions, ${unique.size} unique display numbers`);
console.log(unique.size === numbers.length ? '✅ PASS: No duplicates' : '❌ FAIL: Duplicates found');
```

**Expected Results**:
- All 10 suggestions created successfully
- Each gets a unique display number
- No duplicates in display_number column

### 8. Display Format Edge Cases
**Objective**: Verify formatting handles edge cases

**Test Cases**:
- displayNumber = 1 → "Suggestion 0001"
- displayNumber = 99 → "Suggestion 0099"
- displayNumber = 999 → "Suggestion 0999"
- displayNumber = 1000 → "Suggestion 1000"
- displayNumber = 9999 → "Suggestion 9999"
- displayNumber = 10000 → "Suggestion 10000" (not truncated)

**Steps**: Query database or use browser console:
```javascript
function getSuggestionLabel(s) {
  if (s.title && s.title.trim()) return s.title;
  if (s.displayNumber) return `Suggestion ${String(s.displayNumber).padStart(4, '0')}`;
  return `Suggestion #${s.id.slice(0, 8)}`;
}

// Test
console.log(getSuggestionLabel({ displayNumber: 1 })); // Suggestion 0001
console.log(getSuggestionLabel({ displayNumber: 1000 })); // Suggestion 1000
console.log(getSuggestionLabel({ displayNumber: 10000 })); // Suggestion 10000
```

**Expected Results**: All format correctly with padding, no truncation

## Regression Tests

### Verify Existing Functionality
1. **Endorsements**: Can still endorse suggestions
2. **Voting**: Admin can still mark suggestions as voted_on/passed/failed
3. **Status Changes**: Can still mark suggestions as accepted/rejected
4. **Filters**: Sorting by newest/oldest/closest_to_ballot still works
5. **Categories**: Category filter still works

## Performance Tests (Optional)

### Large Dataset
1. Create 1000+ suggestions (via script or import)
2. Verify `/api/suggestions` loads in < 2 seconds
3. Verify backfill completes without timeout
4. Verify public page renders without lag

## Security Tests

### Unauthorized Title Editing
1. Log out or clear admin cookie
2. Try to update a suggestion title via API:
   ```bash
   curl -X PUT http://localhost:3000/api/admin/suggestions \
     -H "Content-Type: application/json" \
     -d '{"id":"some-id","title":"Hacked"}'
   ```
3. **Expected**: 403 Forbidden response

## Summary Checklist

- [ ] Existing suggestions have display numbers
- [ ] New suggestions get sequential display numbers
- [ ] Public UI shows title when present
- [ ] Public UI shows "Suggestion ####" when no title
- [ ] Admin can edit/set titles for any suggestion
- [ ] Title changes persist and display publicly
- [ ] Display format handles edge cases correctly
- [ ] No regressions in existing features
- [ ] Unauthorized users cannot edit titles
