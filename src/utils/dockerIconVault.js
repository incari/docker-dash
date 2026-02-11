/**
 * Homarr Dashboard Icons Integration for Backend
 * Provides utilities to map container names to Homarr Dashboard Icons URLs
 *
 * Uses icons from: https://github.com/homarr-labs/dashboard-icons
 * All icons are available via CDN at: https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HOMARR_ICONS_BASE_URL = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons";

/**
 * Custom icon mappings for specific Docker images
 * These take priority over the Homarr Dashboard Icons
 * Loaded from shared customIconMappings.json file
 */
const CUSTOM_ICON_MAPPINGS = JSON.parse(
  readFileSync(join(__dirname, '../../customIconMappings.json'), 'utf-8')
);

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
 * - "immich_postgres" -> "immich" (extract base name before underscore)
 * - "immich_redis" -> "immich" (extract base name before underscore)
 * @param {string} containerName - The container name to normalize
 * @returns {string} Normalized container name
 */
function normalizeContainerName(containerName) {
  if (!containerName) return "";

  // Remove leading slash if present (Docker adds this)
  let normalized = containerName.replace(/^\//, "");

  // Remove version tags (e.g., :latest, :14.2, :3.11-alpine)
  normalized = normalized.split(":")[0] || "";

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

  // Handle underscores: extract base name before underscore
  // This handles cases like "immich_postgres" -> "immich", "immich_redis" -> "immich"
  if (normalized.includes("_")) {
    const firstPart = normalized.split("_")[0];
    if (firstPart) {
      return firstPart;
    }
  }

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
 * @param {string} containerName - The container name
 * @returns {string} The icon URL
 */
function getDockerIconVaultUrl(containerName) {
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
 * Returns either the Homarr Dashboard Icons URL or the default icon
 * @param {string} containerName - The container name
 * @param {string} defaultIcon - The default icon to use if no match found (default: "Server")
 * @returns {string} The icon URL or default icon
 */
function getContainerIcon(containerName, defaultIcon = "Server") {
  const vaultUrl = getDockerIconVaultUrl(containerName);
  return vaultUrl || defaultIcon;
}

export {
  normalizeContainerName,
  getDockerIconVaultUrl,
  getContainerIcon
};

