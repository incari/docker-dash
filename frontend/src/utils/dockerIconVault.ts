/**
 * Utility functions for Homarr Dashboard Icons integration
 * Maps container names to curated Docker icons from https://github.com/homarr-labs/dashboard-icons
 * All icons are available via CDN at: https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons
 */

import customIconMappings from "../../../customIconMappings.json";

const HOMARR_ICONS_BASE_URL =
  "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons";

/**
 * Custom icon mappings for specific Docker images
 * These take priority over the Homarr Dashboard Icons
 * Loaded from shared customIconMappings.json file
 */
const CUSTOM_ICON_MAPPINGS: Record<string, string> = customIconMappings;

/**
 * Normalize container name to match Homarr Dashboard Icons naming convention
 * Examples:
 * - "plex" -> "plex"
 * - "plex:latest" -> "plex"
 * - "linuxserver/transmission" -> "transmission" (strip vendor prefix)
 * - "linuxserver/transmission:latest" -> "transmission"
 * - "mysql-db-1" -> "mysql" (extract first part before hyphen-number)
 * - "postgres-adminer-1" -> "postgres" (extract first part)
 * - "supabase-kong" -> "supabase-kong" (keep if no number suffix)
 */
export function normalizeContainerName(containerName: string): string {
  if (!containerName) return "";

  // Remove version tags (e.g., ":latest", ":14.2")
  let normalized = containerName.split(":")[0] || "";

  // Convert to lowercase
  normalized = normalized.toLowerCase();

  // Strip vendor prefixes (e.g., "linuxserver/", "lscr.io/linuxserver/")
  // Common vendor prefixes: linuxserver, lscr.io, ghcr.io, etc.
  const vendorPrefixPattern = /^(?:[^\/]+\/)*([^\/]+)$/;
  const match = normalized.match(vendorPrefixPattern);
  if (match && match[1]) {
    normalized = match[1];
  }

  // Remove Docker Compose instance numbers (e.g., "mysql-db-1" -> "mysql-db", "postgres-1" -> "postgres")
  // Pattern: ends with hyphen followed by one or more digits
  normalized = normalized.replace(/-\d+$/, "");

  // If the name still contains hyphens, try to extract the first meaningful part
  // This handles cases like "mysql-db" -> "mysql", "postgres-adminer" -> "postgres"
  if (normalized.includes("-")) {
    const firstPart = normalized.split("-")[0];
    if (firstPart) {
      return firstPart;
    }
  }

  return normalized;
}

/**
 * Get the Homarr Dashboard Icons URL for a container name
 * Returns the icon URL based on the normalized container name
 * Checks custom mappings first, then falls back to Homarr Dashboard Icons
 */
export function getDockerIconVaultUrl(containerName: string): string | null {
  const normalized = normalizeContainerName(containerName);

  if (!normalized) {
    return null;
  }

  // Check if there's a custom icon mapping for this container
  if (CUSTOM_ICON_MAPPINGS[normalized]) {
    return CUSTOM_ICON_MAPPINGS[normalized];
  }

  // Fall back to Homarr Dashboard Icons
  return `${HOMARR_ICONS_BASE_URL}/png/${normalized}.png`;
}

/**
 * Get the appropriate icon for a container
 * Returns Homarr Dashboard Icons URL if available, otherwise returns the default icon name
 */
export function getContainerIcon(
  containerName: string,
  defaultIcon: string = "Server",
): string {
  const vaultUrl = getDockerIconVaultUrl(containerName);
  return vaultUrl || defaultIcon;
}
