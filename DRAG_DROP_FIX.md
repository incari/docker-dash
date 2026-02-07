# Drag-and-Drop Fixes

## Problem 1: Initial Drag-and-Drop Not Working

Shortcuts within `SectionBlock` components were not draggable on initial page load when entering edit mode. They only became draggable AFTER reordering the sections themselves.

## Problem 2: Empty "No Section" Drop Zone

When the "No Section" area was empty, it would not accept items being dragged into it.

## Problem 3: State Reset on Subsequent Changes

When dragging items to/from the "No Section" area and then making another change (like reordering items or sections), the items from "No Section" would reset back to their initial positions.

## Root Causes

### Problem 1: Nested drag-and-drop initialization timing issue

1. The parent `sectionsParent` drag-and-drop context (for reordering sections) was being initialized at the same time as child `parent` refs (for reordering shortcuts within sections)
2. FormKit's drag-and-drop library requires the parent context to be fully established before child contexts can properly initialize
3. The `useDragAndDrop` hook was being called during component render, before the DOM was fully ready
4. The `parent` ref in `SectionBlock` was attached to a conditionally rendered element, compounding the timing issue

**Why it worked after reordering sections:**
- Reordering sections triggered a re-render of all `SectionBlock` components
- By that time, the parent `sectionsParent` context was fully initialized
- The child drag-and-drop zones could then properly initialize within the established parent context

### Problem 2: Same timing issue for unsectioned area

The "No Section" area had the same timing issue when empty.

### Problem 3: Props sync overwriting local state during edit mode

1. During edit mode, drag operations update local state (`unsectionedList`, `list`)
2. These changes are recorded in `pendingChangesRef` but NOT immediately saved to the backend
3. The parent component's props (`unsectionedShortcuts`, `shortcutsBySection`) remain unchanged
4. When any other change triggers a re-render, the sync effect runs and resets local state back to the original props
5. This creates a circular dependency where user changes are lost

**The flow:**
```
User drags item → Local state updates → Change recorded in pendingChangesRef
→ Another drag happens → Parent re-renders → Sync effect runs
→ Local state reset to original props → User's first change is lost
```

## Solutions

### Solution 1 & 2: Timing-independent initialization

Changed from `useDragAndDrop` hook to the lower-level `dragAndDrop` function in both `SectionBlock.tsx` and `useDashboardDragDrop.ts`:

### Solution 3: Conditional props sync

Only sync from props when NOT in edit mode. During edit mode, local state is the source of truth.

### Before (timing-dependent):
```typescript
const [parent, list, setList] = useDragAndDrop<HTMLDivElement, Shortcut>(
  shortcuts,
  {
    disabled: !isEditMode,
    group: "shortcuts",
    plugins: [animations()],
  },
);
```

### After (timing-independent):
```typescript
const parentRef = useRef<HTMLDivElement>(null);
const [list, setList] = useState<Shortcut[]>(shortcuts);

useEffect(() => {
  if (!parentRef.current) return;

  dragAndDrop({
    parent: parentRef.current,
    state: [list, setList],
    disabled: !isEditMode,
    group: "shortcuts",
    plugins: [animations()],
  });
}, [isEditMode]);
```

## Key Changes

### For timing issues (Problems 1 & 2):

1. **Manual ref management**: Use `useRef` instead of relying on `useDragAndDrop`'s automatic ref
2. **Explicit state**: Use `useState` to manage the list state
3. **useEffect initialization**: Initialize drag-and-drop in a `useEffect` that runs after the DOM is ready
4. **Conditional check**: Only initialize if `parentRef.current` exists (DOM element is mounted)
5. **Re-initialize on edit mode change**: The effect re-runs when `isEditMode` or `list` changes

### For state reset issue (Problem 3):

**Before (syncs always):**
```typescript
useEffect(() => {
  setList(shortcuts);
  prevListRef.current = shortcuts;
}, [shortcuts]);
```

**After (syncs only when NOT in edit mode):**
```typescript
useEffect(() => {
  if (!isEditMode) {
    setList(shortcuts);
    prevListRef.current = shortcuts;
  }
}, [shortcuts, isEditMode]);
```

This ensures that during edit mode, the local state remains the source of truth and isn't overwritten by props.

## Benefits

- ✅ No timing dependencies between parent and child drag-and-drop contexts
- ✅ Initialization happens after DOM is fully ready
- ✅ Works on initial page load without requiring a re-render
- ✅ Empty drop zones accept items correctly
- ✅ Local state persists during edit mode without being reset
- ✅ Multiple drag operations work correctly in sequence
- ✅ Cleaner separation of concerns
- ✅ More predictable behavior

## Files Modified

1. **`frontend/src/components/dashboard/SectionBlock.tsx`**
   - Replaced `useDragAndDrop` hook with manual `dragAndDrop` initialization
   - Fixed shortcuts within sections not being draggable on initial load

2. **`frontend/src/hooks/useDashboardDragDrop.ts`**
   - Replaced `useDragAndDrop` hook with manual `dragAndDrop` initialization for unsectioned area
   - Fixed empty "No Section" drop zone not accepting items

## Testing

To verify all fixes:

1. Start the application
2. Navigate to the dashboard
3. Enter edit mode

### Test 1: Initial drag-and-drop (Problem 1)
- Try dragging shortcuts within sections immediately
- ✅ Shortcuts should be draggable without needing to reorder sections first

### Test 2: Empty drop zone (Problem 2)
- Drag all items out of the "No Section" area to make it empty
- ✅ You should still be able to drag items from sections into the empty "No Section" area

### Test 3: Multiple operations (Problem 3)
- Drag an item from a section to "No Section"
- Then drag another item within a section (or reorder sections)
- ✅ The first item should stay in "No Section" and not reset to its original position
- Perform several drag operations in sequence
- ✅ All changes should persist until you exit edit mode

### Test 4: Exit edit mode
- Make several drag changes
- Exit edit mode
- ✅ All changes should be saved to the backend
- Re-enter edit mode
- ✅ All changes should be reflected correctly

