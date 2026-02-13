/**
 * Homarr Dashboard Icons Integration for Backend
 * Provides utilities to map container names to Homarr Dashboard Icons URLs
 *
 * Uses icons from: https://github.com/homarr-labs/dashboard-icons
 * All icons are available via CDN at: https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const HOMARR_ICONS_BASE_URL =
  "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons";

/**
 * Custom icon mappings for specific Docker images
 * These take priority over the Homarr Dashboard Icons
 * Loaded from shared customIconMappings.json file
 */
export const CUSTOM_ICON_MAPPINGS: Record<string, string> = JSON.parse(
  readFileSync(join(__dirname, "../../customIconMappings.json"), "utf-8"),
);

/**
 * Normalize container name to match Homarr Dashboard Icons naming convention
 *
 * IMPORTANT: This function checks custom mappings at each normalization step
 * to avoid breaking names like "docker-controller-bot" into just "docker"
 */
export function normalizeContainerName(
  containerName: string | null | undefined,
): string {
  if (!containerName) return "";

  // Remove leading slash if present (Docker adds this)
  let normalized = containerName.replace(/^\//, "");

  // Remove version tags (e.g., :latest, :14.2, :3.11-alpine)
  normalized = normalized.split(":")[0] || "";

  // Convert to lowercase
  normalized = normalized.toLowerCase();

  // Check if the raw lowercase name (with instance numbers) matches custom mappings
  if (CUSTOM_ICON_MAPPINGS[normalized]) {
    return normalized;
  }

  // Strip vendor prefixes (e.g., "linuxserver/", "lscr.io/linuxserver/")
  const vendorPrefixPattern = /^(?:[^\/]+\/)*([^\/]+)$/;
  const match = normalized.match(vendorPrefixPattern);
  if (match && match[1]) {
    normalized = match[1];
  }

  // Check custom mappings after stripping vendor prefix
  if (CUSTOM_ICON_MAPPINGS[normalized]) {
    return normalized;
  }

  // Remove Docker Compose instance numbers (e.g., portainer-1 → portainer)
  const withoutInstance = normalized.replace(/-\d+$/, "");

  // Check custom mappings after removing instance number
  if (CUSTOM_ICON_MAPPINGS[withoutInstance]) {
    return withoutInstance;
  }

  normalized = withoutInstance;

  // At this point, only apply aggressive normalization if no custom mapping exists
  // for the current normalized name

  // Handle underscores: extract base name before underscore
  // Only if the full name doesn't have a custom mapping
  if (normalized.includes("_") && !CUSTOM_ICON_MAPPINGS[normalized]) {
    const firstPart = normalized.split("_")[0];
    if (firstPart && !CUSTOM_ICON_MAPPINGS[normalized]) {
      // Check if the first part would be more useful
      return firstPart;
    }
  }

  // For hyphens: DON'T split aggressively anymore
  // Names like "docker-controller-bot" should stay intact
  // The Homarr CDN uses hyphens in icon names (e.g., "home-assistant.png")

  return normalized;
}

/**
 * Get the Homarr Dashboard Icons URL for a container name
 */
export function getDockerIconVaultUrl(
  containerName: string | null | undefined,
): string | null {
  if (!containerName) {
    return null;
  }

  // Step 1: Convert to lowercase and remove leading slash and version tags
  const rawLowercase = containerName
    .toLowerCase()
    .replace(/^\//, "")
    .split(":")[0];

  // Step 2: Check custom mappings FIRST with the raw lowercase name
  if (rawLowercase && CUSTOM_ICON_MAPPINGS[rawLowercase]) {
    return CUSTOM_ICON_MAPPINGS[rawLowercase];
  }

  // Step 3: Remove Docker Compose instance numbers and check custom mappings again
  const withoutInstanceNumber = rawLowercase.replace(/-\d+$/, "");
  if (
    withoutInstanceNumber !== rawLowercase &&
    CUSTOM_ICON_MAPPINGS[withoutInstanceNumber]
  ) {
    return CUSTOM_ICON_MAPPINGS[withoutInstanceNumber];
  }

  // Step 4: Normalize the container name
  const normalized = normalizeContainerName(containerName);

  if (!normalized) {
    return null;
  }

  // Step 5: Check custom mappings again with the normalized name
  if (CUSTOM_ICON_MAPPINGS[normalized]) {
    return CUSTOM_ICON_MAPPINGS[normalized];
  }

  // Step 6: Fall back to Homarr Dashboard Icons
  return `${HOMARR_ICONS_BASE_URL}/png/${normalized}.png`;
}

/**
 * Get the appropriate icon for a container
 */
export function getContainerIcon(
  containerName: string | null | undefined,
  defaultIcon: string = "Server",
): string {
  const vaultUrl = getDockerIconVaultUrl(containerName);
  return vaultUrl || defaultIcon;
}

/**
 * Check if a URL exists (returns true for 2xx responses)
 */
export async function urlExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check if an icon is a custom mapping (trusted, no validation needed)
 */
export function isCustomMappingIcon(iconUrl: string): boolean {
  return Object.values(CUSTOM_ICON_MAPPINGS).includes(iconUrl);
}

/**
 * Get a validated icon URL for a container
 *
 * This function:
 * 1. Gets the icon URL using the standard resolution logic
 * 2. If it's a custom mapping, returns it immediately (trusted)
 * 3. If it's a Homarr CDN URL, validates that it exists before returning
 * 4. Falls back to the default icon if the URL doesn't exist
 *
 * @param containerName - The container name to get icon for
 * @param defaultIcon - Fallback icon (default: "Server" - a Lucide icon name)
 * @returns The validated icon URL or the default icon
 */
export async function getValidatedIconUrl(
  containerName: string | null | undefined,
  defaultIcon: string = "Server",
): Promise<string> {
  const iconUrl = getDockerIconVaultUrl(containerName);

  if (!iconUrl) {
    return defaultIcon;
  }

  // Custom mappings are trusted - no validation needed
  if (isCustomMappingIcon(iconUrl)) {
    return iconUrl;
  }

  // Validate Homarr CDN URLs
  if (iconUrl.includes("homarr-labs/dashboard-icons")) {
    const exists = await urlExists(iconUrl);
    if (!exists) {
      console.log(
        `[ICON] Homarr icon not found for "${containerName}", using default`,
      );
      return defaultIcon;
    }
  }

  return iconUrl;
}
