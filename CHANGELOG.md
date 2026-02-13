# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Toast Notifications (2026-02-13)

- **Toast Notifications**: Success and error messages now appear as non-blocking toast notifications in the bottom-right corner
  - Toasts auto-dismiss after a few seconds
  - Can be manually dismissed by clicking the X button
  - Different colors for success (green), error (red), info (blue), and warning (yellow)
- **Confirmation Modals**: Modals are now reserved for important actions that require user approval (delete, stop containers, etc.)

#### Icon Migration Improvements (2026-02-13)

- **Side-by-Side Icon Preview**: Migration modal now shows both current and new icons
  - See exactly what will change before applying
  - Arrow indicator between current and new icons for clarity
- **Per-Row Loading**: Each icon loads independently with its own spinner
  - No more waiting for all icons to load before seeing the list
  - Faster modal opening experience
- **Editable URLs**: All icon URLs are now editable, even for shortcuts that already have icons set
- **Smart Selection**: Only shortcuts that need updating are pre-selected
  - Shortcuts already using the correct icon show "Already set" but remain unchecked
  - You can still select them if you want to update anyway

### Fixed

#### Icon Migration Fixes (2026-02-13)

- **Cached Image Spinner**: Fixed issue where spinners would persist when reopening the migration modal with cached images
- **Custom Links Visibility**: Fixed issue where custom links (non-container shortcuts) were incorrectly hidden from the dashboard

## [0.2.0] - 2026-02-11

### Added

#### Homarr Dashboard Icons Integration

- **Homarr Dashboard Icons Library**: Migrated from docker-icon-vault to [Homarr Dashboard Icons](https://github.com/homarr-labs/dashboard-icons) for broader icon coverage
- **Custom Icon Mappings**: Added support for custom container icons with priority over default library
  - Custom icons defined in shared `customIconMappings.json` file (single source of truth)
  - Both backend and frontend import from the same JSON file
  - Currently supports: `docker-controller-bot`, `dropbot`, `wakebot`, `homeassistant`
  - See [CUSTOM_DOCKER_ICONS.md](CUSTOM_DOCKER_ICONS.md) for documentation
- **Enhanced Container Name Normalization**: Improved normalization to handle vendor prefixes, version tags, and instance numbers
  - Strips vendor prefixes (e.g., `linuxserver/`, `lscr.io/`)
  - Removes version tags (e.g., `:latest`, `:14.2`)
  - Handles Docker Compose instance numbers (e.g., `-1`, `-2`)
  - Extracts base names from underscored containers (e.g., `immich_postgres` → `immich`)
- **Icon Migration Modal Improvements**: Updated migration modal to reference Homarr Dashboard Icons
  - Added internationalization support for migration modal
  - English and Spanish translations for all migration UI elements
  - Clear messaging about icon source and upgrade benefits

#### Docker Icon Vault Integration (2026-02-08)

- **Automatic Icon Selection**: Integrated [docker-icon-vault](https://incari.github.io/docker-icon-vault/) with 131+ high-quality icons for official Docker images
- **Smart Icon Matching**: Automatically selects appropriate icons based on container names (nginx, postgres, redis, mysql, etc.)
- **Container Name Normalization**: Removes version tags and normalizes names for better matching
- **Fallback Support**: Unknown containers still get default icons
- **Icon Migration Tool**: New migration modal to update existing shortcuts with docker-icon-vault icons
- **Selective Migration**: Choose which shortcuts to update icons and/or descriptions
- **Docker Icon Vault Data**: Fetch icon descriptions from docker-icon-vault for better context

#### Auto-Sync Functionality (2026-02-08)

- **Automatic Container Sync**: New `/api/shortcuts/auto-sync` endpoint to create shortcuts for containers without them
- **Smart Sync**: Only creates shortcuts for containers that don't already have them

#### Enhanced Error Handling (2026-02-08)

- **Docker Connection Errors**: Better handling when Docker daemon is not running
- **Empty State Management**: Returns empty arrays instead of errors when Docker is unavailable
- **User-Friendly Messages**: Improved error messages and user feedback

### Added

#### Image Upload and Management (2026-02-07)

- **Image Upload Functionality**: Upload custom images for shortcuts directly from your device
- **Image Management**: Delete uploaded images with confirmation dialog to prevent accidental removal
- **Image Selector**: Images uploaded are now available from the icon selector when editing or creating shortcuts.
- **Gifs and SVG Support**: Added support for GIF and SVG image formats.

- **Image Storage**: Images are now stored in a dedicated `uploads` directory within the Docker container.

#### Dashboard Organization and UX (2026-02-07)

- **Edit Mode Banner**: Clear visual indicator when in edit mode with quick section creation
- **Empty Dashboard State**: Helpful onboarding experience for new users with guidance
- **Section Block Component**: Improved section management with better visual hierarchy
- **Shortcut Page** Items in shortcuts are now using the same view mode that is set in the dashboard page.
- **Drag-and-Drop Enhancements**:
  - Fixed several issues with drag-and-drop behavior, including:
  - Shortcuts within sections not being draggable on initial load
  - Empty "No Section" drop zone not accepting items
  - Props sync overwriting local state during edit mode
  - Fixed bug where reordering items where not saved
  - Improve some visual feedback on reordering items
  - **NEW** Adding reordering sections

#### View Modes and Internationalization (2026-02-07)

- **Multiple View Modes**: Switch between different layout styles in Management View
  - **Compact View**: Dense layout for viewing many shortcuts at once
  - **Icon View**: Visual grid layout emphasizing icons
  - **List View**: Detailed list with full information
  - **Table View**: Spreadsheet-style layout for power users
- **Internationalization Support**:
  - Full English and Spanish translations
  - Localized error messages and UI elements
  - Easy to extend with additional languages (PRs welcome!)
- **Conditional Star Icons**: Smart display of favorite indicators based on context
- **Enhanced Error Handling**: Better user feedback when saving shortcuts fails

#### Performance Optimizations (2026-02-07)

- **React Performance**:
  - Memoized form submission handlers with `useCallback`
  - Optimized computed values with `useMemo`
  - Reduced unnecessary re-renders in modal components
- **Validation Improvements**: Enhanced validation logic in ShortcutModal
- **Code Quality**: Improved code formatting and readability across components

#### Component Architecture (2026-02-07)

- **Modular Dashboard Components**:
  - `EditModeBanner` for edit mode status
  - `EmptyDashboardState` for onboarding
  - `SectionBlock` for section management

### Changed

#### (2026-02-11)

- **Unified Icon Mappings**: Refactored `CUSTOM_ICON_MAPPINGS` to use a single source of truth
  - Created `customIconMappings.json` as shared configuration file
  - Backend imports via `fs.readFileSync()` with ES modules support
  - Frontend imports via TypeScript JSON module resolution
  - Eliminates duplication and ensures consistency between backend and frontend

- **Icon Resolution Logic**: Updated to check custom icon mappings first before falling back to Homarr Dashboard Icons
- **Migration Modal Text**: Updated to accurately reflect Homarr Dashboard Icons as the icon source
- **Translation System**: Added complete i18n support for migration modal in English and Spanish
- **Documentation**: Created comprehensive CUSTOM_DOCKER_ICONS.md guide for adding custom icons
- **README Updates**: Enhanced README with new features section highlighting Homarr integration and custom icons

#### (2026-02-08)

- **Footer Component**: Refactored to include migration button and improved layout
- **Modal Management**: Enhanced modal system with migration modal support
- **API Service**: Added new endpoints for auto-sync and migration operations
- **Shortcut Actions**: Updated to use docker-icon-vault for automatic icon selection
- **Dashboard Data Hook**: Improved data fetching and state management
- **Confirm/Error Modals**: Enhanced styling and z-index management for better UX
- **Default Favorite Status**: Changed default `is_favorite` value from 1 to 0 for new shortcuts

#### (2026-02-07)

- Refactored DashboardView component for better maintainability
- Improved section rendering logic with enhanced type definitions
- Updated ShortcutCard components to support multiple view modes
- Enhanced responsive design for better mobile and desktop experience

### Fixed

#### (2026-02-11)

- **Icon Mapping Key Consistency**: Fixed `wakebot` key casing inconsistency between backend (`"WakeBot"`) and frontend (`wakebot`)
  - All custom icon mapping keys now use lowercase to match container name normalization
  - Ensures reliable icon matching regardless of original container name casing
- **Docker Build**: Fixed Docker build failure by copying `customIconMappings.json` to both frontend-builder and final production stages
  - Frontend build now has access to shared icon mappings during Vite build
  - Backend runtime has access to icon mappings in production container
- **Migration Icon Verification**: Fixed migration tool to verify icons exist before replacing
  - **Priority 1**: Uses custom icon mappings from `customIconMappings.json` (guaranteed to exist)
  - **Priority 2**: Verifies Homarr Dashboard Icons exist via HTTP HEAD request before using them
  - **Preservation**: Only preserves existing icons when no match is found in either custom mappings or Homarr
  - **Replaces ALL icons** (including custom URLs) if a verified Homarr icon exists for the container
  - Prevents broken image links by verifying icon URLs before replacement
  - Provides detailed logging showing which icons were verified, updated, or preserved
  - Migration may be slower due to HTTP verification, but runs only once

- **TypeScript Errors**: Fixed translation function type errors in ShortcutModal by using manual string interpolation
- **Icon Mapping Consistency**: Ensured custom icon mappings are synchronized between backend and frontend
- **Container Name Normalization**: Improved handling of complex container naming patterns (vendor prefixes, underscores, hyphens)
- **Translation Interpolation**: Fixed count parameter handling in translation strings using `.replace()` method

#### (2026-02-08)

- **Docker Connection Handling**: Fixed error when Docker daemon is not running (returns empty array instead of 500 error)
- **Container List Errors**: Gracefully handles ECONNREFUSED errors when Docker is unavailable
- **Auto-Sync Resilience**: Auto-sync now handles Docker unavailability without crashing
- **Modal Z-Index**: Fixed z-index conflicts between modals and dropdowns
- **Shortcut Card Display**: Improved icon and description rendering in all view modes

#### (2026-02-07)

- Improved drag-and-drop reliability and visual feedback
- Better error handling in image upload and shortcut saving
- Enhanced validation to prevent invalid shortcut configurations
- Fixed several issues with drag-and-drop behavior

---

[Unreleased]: https://github.com/incari/docker-dash/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/incari/docker-dash/releases/tag/v0.2.0
