# Visual Comparison: Before vs After

## UI Changes

### Before (No Visual Feedback)
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
│   ^                                                           │
│   └─ No indication of save behavior or status                │
│                                                               │
│ PROPOSED BY [TeamA ▾]  SPONSOR [TeamB ▾]  VOTE TAG [—None▾] │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### After - Idle State
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
│ [Enter suggestion title (auto-saves on blur)___]             │
│   ^                                                           │
│   └─ Clear indication that it auto-saves                     │
│                                                               │
│ PROPOSED BY [TeamA ▾]  SPONSOR [TeamB ▾]  VOTE TAG [—None▾] │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### After - Saving State
```
┌─────────────────────────────────────────────────────────────┐
│ Admin • Suggestions Votes                                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ Jan 15, 2025, 3:45 PM                              [Rules]   │
│                                                               │
│ Add a new trading block feature to allow teams...            │
│                                                               │
│ TITLE  Saving...                                             │
│ [Add Trading Block Feature_____________________]             │
│         ^                                                     │
│         └─ User knows save is in progress                    │
│                                                               │
│ PROPOSED BY [TeamA ▾]  SPONSOR [TeamB ▾]  VOTE TAG [—None▾] │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### After - Success State (2 seconds)
```
┌─────────────────────────────────────────────────────────────┐
│ Admin • Suggestions Votes                                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ Jan 15, 2025, 3:45 PM                              [Rules]   │
│                                                               │
│ Add a new trading block feature to allow teams...            │
│                                                               │
│ TITLE  ✓ Saved                                               │
│ [Add Trading Block Feature_____________________]             │
│         ^                                                     │
│         └─ Confirmation that save succeeded                  │
│                                                               │
│ PROPOSED BY [TeamA ▾]  SPONSOR [TeamB ▾]  VOTE TAG [—None▾] │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### After - Error State
```
┌─────────────────────────────────────────────────────────────┐
│ Admin • Suggestions Votes                                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ Jan 15, 2025, 3:45 PM                              [Rules]   │
│                                                               │
│ Add a new trading block feature to allow teams...            │
│                                                               │
│ TITLE  Failed to save                                        │
│ [Original Title Restored___________________]                 │
│         ^                                                     │
│         └─ Clear error message + value reverted              │
│                                                               │
│ PROPOSED BY [TeamA ▾]  SPONSOR [TeamB ▾]  VOTE TAG [—None▾] │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Interaction Flow

### Before (Broken)
```
┌─────────────┐
│ User Types  │
│   "Title"   │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ onChange fires      │
│ Updates state:      │
│ s.title = "Title"   │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ User Clicks Away    │
│ (blur event)        │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ onBlur compares:    │
│ input = "Title"     │
│ s.title = "Title"   │ ← Already updated!
│ They match!         │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Early return        │
│ NO SAVE! ❌         │
└─────────────────────┘
```

### After (Fixed)
```
┌─────────────┐
│ User Focus  │
│   Field     │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ onFocus stores:     │
│ data-original-title │
│ = "Original"        │
└──────┬──────────────┘
       │
       ▼
┌─────────────┐
│ User Types  │
│   "Title"   │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ onChange fires      │
│ Updates state:      │
│ s.title = "Title"   │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ User Clicks Away    │
│ (blur event)        │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ onBlur compares:    │
│ input = "Title"     │
│ original = "Original"│ ← Stored value!
│ Different!          │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Show "Saving..."    │
│ Call API            │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Show "✓ Saved"      │
│ SAVE SUCCESS! ✅    │
└─────────────────────┘
```

## Color Coding (CSS)

### Saving State
- Text color: Blue (`text-blue-600`)
- Message: "Saving..."

### Success State
- Text color: Green (`text-green-600`)
- Message: "✓ Saved"

### Error State
- Text color: Red (`text-red-600`)
- Message: "Failed to save"

## User Experience Improvements

| Aspect | Before | After |
|--------|--------|-------|
| **Save Indication** | None | "Saving..." appears |
| **Success Feedback** | None | "✓ Saved" for 2 seconds |
| **Error Feedback** | Silent failure | "Failed to save" + revert |
| **Save Behavior** | Unclear | Placeholder says "auto-saves on blur" |
| **User Confidence** | Low (no feedback) | High (clear status) |
| **Error Recovery** | Lost changes | Reverts to original |

## Implementation Details

### State Structure
```typescript
const [saveStatus, setSaveStatus] = useState<
  Record<string, 'saving' | 'saved' | 'error' | null>
>({});
```

Each suggestion has its own save status, allowing multiple suggestions to have different states simultaneously.

### Data Attribute Usage
```typescript
onFocus={(e) => {
  e.target.setAttribute('data-original-title', s.title || '');
}}

onBlur={async (e) => {
  const originalTitle = e.target.getAttribute('data-original-title') || '';
  // Compare with original, not current state
}}
```

### Auto-Clear Timeout
```typescript
setTimeout(() => {
  setSaveStatus((prev) => ({ ...prev, [s.id]: null }));
}, 2000);
```
Success message automatically disappears after 2 seconds to avoid clutter.
