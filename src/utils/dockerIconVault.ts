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

export const HOMARR_ICONS_BASE_URL = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons";

/**
 * Custom icon mappings for specific Docker images
 * These take priority over the Homarr Dashboard Icons
 * Loaded from shared customIconMappings.json file
 */
export const CUSTOM_ICON_MAPPINGS: Record<string, string> = JSON.parse(
  readFileSync(join(__dirname, '../../customIconMappings.json'), 'utf-8')
);

/**
 * Normalize container name to match Homarr Dashboard Icons naming convention
 */
export function normalizeContainerName(containerName: string | null | undefined): string {
  if (!containerName) return "";

  // Remove leading slash if present (Docker adds this)
  let normalized = containerName.replace(/^\//, "");

  // Remove version tags (e.g., :latest, :14.2, :3.11-alpine)
  normalized = normalized.split(":")[0] || "";

  // Convert to lowercase
  normalized = normalized.toLowerCase();

  // Strip vendor prefixes (e.g., "linuxserver/", "lscr.io/linuxserver/")
  const vendorPrefixPattern = /^(?:[^\/]+\/)*([^\/]+)$/;
  const match = normalized.match(vendorPrefixPattern);
  if (match && match[1]) {
    normalized = match[1];
  }

  // Remove Docker Compose instance numbers
  normalized = normalized.replace(/-\d+$/, "");

  // Handle underscores: extract base name before underscore
  if (normalized.includes("_")) {
    const firstPart = normalized.split("_")[0];
    if (firstPart) {
      return firstPart;
    }
  }

  // If the name still contains hyphens, try to extract the first meaningful part
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
 */
export function getDockerIconVaultUrl(containerName: string | null | undefined): string | null {
  if (!containerName) {
    return null;
  }

  // Step 1: Convert to lowercase and remove leading slash and version tags
  const rawLowercase = containerName.toLowerCase().replace(/^\//, '').split(':')[0];

  // Step 2: Check custom mappings FIRST with the raw lowercase name
  if (rawLowercase && CUSTOM_ICON_MAPPINGS[rawLowercase]) {
    return CUSTOM_ICON_MAPPINGS[rawLowercase];
  }

  // Step 3: Remove Docker Compose instance numbers and check custom mappings again
  const withoutInstanceNumber = rawLowercase.replace(/-\d+$/, '');
  if (withoutInstanceNumber !== rawLowercase && CUSTOM_ICON_MAPPINGS[withoutInstanceNumber]) {
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
export function getContainerIcon(containerName: string | null | undefined, defaultIcon: string = "Server"): string {
  const vaultUrl = getDockerIconVaultUrl(containerName);
  return vaultUrl || defaultIcon;
}

