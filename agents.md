# Docker Dashboard Project Instructions

- **Technology Stack**: React, Tailwind CSS, Lucide-React (icons).
- **Core Functionality**:
    - Fetch and display running Docker containers.
    - Manage "Shortcuts" (favorites) in a persistent Dashboard.
    - Shortcuts can link to a specific Port or a custom URL.
- **Shortcut Features**:
    - Customizable Name and Description.
    - Customizable Icon/Image (Icon selection, Image URL, or Upload).
    - **UX/UI**: No absolute positioning for icons; icons must be part of the flow.
- **Responsiveness**:
    - Mobile: Single tap to redirect; icons always visible.
    - Desktop: Action buttons (Edit/Delete) visible on hover.
- **Navigation**:
    - **Dashboard Page**: Quick access to saved shortcuts.
    - **Add/Edit Page**: Select from active containers (Star icon to quick-add) or add manually.
- **Database**: Use existing SQLite backend for persistence.
- **Container Control**: Ability to Start/Stop/Restart containers from the UI.

## Drag and Drop Implementation

### Core Architecture
- **Library**: `@dnd-kit` (core, sortable, modifiers).
- **Structure**:
  - `DndContext` (in `DashboardView`): Main provider handling events.
  - `SortableContext`: Wraps lists of items for reordering.
  - `DroppableSection`: Wraps each section (including "No Section").
  - `SectionDropZone`: The "Drop Here" visual indicator.

### Logic Flow
1. **Dragging State**:
   - `handleDragStart`: Sets `activeId`.
   - `shouldShowDropZone`: **CRITICAL**. Checks if a section is effectively empty by filtering out the currently dragged item (`shortcuts.filter(s => s.id !== activeId)`).
   
2. **Visual Feedback**:
   - **Empty Section**: Shows `SectionDropZone` (pulsing "Drop here").
   - **Populated Section**: Shows `DroppableSection` border highlight (`z-10` border, NO overlay to prevent blocking items).
   - **Items**: Dragged item disappears from original position (filtered out) and appears in `DragOverlay`.

3. **Event Handling**:
   - `handleDragOver`: Real-time reordering preview (optimistic).
   - `handleDragEnd`: Commit changes to backend (`/reorder` or `/section` endpoints).
   - **Data Refresh**: Must call `fetchData()` after drops to ensure state consistency.

### Rules for Refactoring
- **Never** cover grid items with a solid overlay in `DroppableSection`.
- **Always** filter out `activeId` when rendering lists during drag to prevent duplication/layout shifts.
- **Always** check for `activeId` to conditionally render `SectionDropZone`.
