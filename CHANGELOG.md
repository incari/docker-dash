# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- **Custom Hooks**: 
  - `useDashboardDragDrop` for centralized drag-and-drop logic
- **Utility Functions**: Dashboard helpers for common operations

### Changed (2026-02-07)
- Refactored DashboardView component for better maintainability
- Improved section rendering logic with enhanced type definitions
- Updated ShortcutCard components to support multiple view modes
- Enhanced responsive design for better mobile and desktop experience

### Fixed (2026-02-07)
- Improved drag-and-drop reliability and visual feedback
- Better error handling in image upload and shortcut saving
- Enhanced validation to prevent invalid shortcut configurations
- Fixed several issues with drag-and-drop behavior
