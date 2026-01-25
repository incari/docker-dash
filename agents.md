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
