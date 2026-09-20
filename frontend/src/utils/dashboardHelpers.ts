import type {
  ViewMode,
  MobileColumns,
  DockerContainer,
  Shortcut,
} from "../types";
import {
  ShortcutCard,
  ShortcutCardCompact,
  ShortcutCardIcon,
  ShortcutCardList,
  ShortcutCardTable,
} from "../components";

/**
 * Dashboard utility functions
 */

/**
 * Get the appropriate card component based on view mode
 */
export function getCardComponentForViewMode(viewMode: ViewMode) {
  switch (viewMode) {
    case "compact":
      return ShortcutCardCompact;
    case "icon":
      return ShortcutCardIcon;
    case "list":
      return ShortcutCardList;
    case "table":
      return ShortcutCardTable;
    default:
      return ShortcutCard;
  }
}

/**
 * Get grid layout classes based on view mode and mobile columns setting
 */
export function getGridLayoutClasses(
  viewMode: ViewMode,
  mobileColumns: MobileColumns,
): string {
  const mobileClass = mobileColumns === 1 ? "grid-cols-1" : "grid-cols-2";

  switch (viewMode) {
    case "compact":
      return `grid ${mobileClass} md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`;
    case "icon":
      return `grid ${mobileClass} md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3`;
    case "list":
      return `grid grid-cols-1 gap-3`;
    case "table":
      return `grid grid-cols-1 gap-2`;
    default:
      return `grid ${mobileClass} md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6`;
  }
}

/**
 * Get minimum height for section content area based on view mode
 * This ensures empty sections in edit mode have enough space for drag-and-drop
 */
export function getMinHeightForViewMode(viewMode: ViewMode): string {
  switch (viewMode) {
    case "compact":
      return "4rem"; // ~64px - compact card height
    case "icon":
      return "8rem"; // ~128px - icon card is square aspect ratio
    case "list":
      return "4.5rem"; // ~72px - list card height
    case "table":
      return "3.5rem"; // ~56px - table row height
    default:
      return "8rem"; // ~128px - default card height (desktop horizontal layout)
  }
}


/**
 * Resolve the Docker container a shortcut points at.
 * Matching is by container_match_name (stable across recreates), falling back
 * to container_name, with the trailing replica suffix stripped off.
 *
 * The search is confined to the shortcut's own server. Container names are only
 * unique within one Docker daemon, so across a fleet a bare name match would
 * hand a shortcut the status - and the start/stop buttons - of a container with
 * the same name on a different machine.
 */
export function findContainerForShortcut(
  shortcut: Shortcut,
  containers: DockerContainer[],
): DockerContainer | null {
  const matchName = shortcut.container_match_name || shortcut.container_name;
  if (!matchName) return null;

  const target = matchName.toLowerCase();
  return (
    containers.find(
      (c) =>
        c.hostId === shortcut.host_id &&
        c.name.replace(/-\d+$/, "").toLowerCase() === target,
    ) ?? null
  );
}
