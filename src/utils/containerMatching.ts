/**
 * Container Matching Utilities
 * 
 * Centralized functions for container name normalization and matching.
 * Used by both shortcuts and containers routes.
 */

/**
 * Get container base name (without instance number suffix)
 * This creates a stable identifier for matching containers across restarts.
 * 
 * Examples:
 * - "portainer-1" → "portainer"
 * - "nginx-proxy-2" → "nginx-proxy"
 * - "homeassistant" → "homeassistant"
 * - "/my-container" → "my-container"
 * 
 * @param name - The container name (may include leading slash from Docker)
 * @returns The normalized base name in lowercase
 */
export function getContainerBaseName(name: string | null | undefined): string {
  if (!name) return "";
  
  // Remove leading slash (Docker adds this)
  const cleanName = name.replace(/^\//, "");
  
  // Remove instance number suffix (e.g., -1, -2)
  // This handles Docker Compose scale numbering
  return cleanName.replace(/-\d+$/, "").toLowerCase();
}

/**
 * Extract base image name from Docker image string for icon matching
 * 
 * Examples:
 * - "linuxserver/plex:latest" → "plex"
 * - "nginx:1.21-alpine" → "nginx"
 * - "ghcr.io/home-assistant/core:stable" → "core"
 * - "portainer/portainer-ce" → "portainer-ce"
 * 
 * @param imageString - The Docker image string
 * @returns The base image name or null if invalid
 */
export function extractImageName(imageString: string | null | undefined): string | null {
  if (!imageString) return null;
  
  // Remove version tag (e.g., :latest, :1.21-alpine)
  const withoutTag = imageString.split(":")[0];
  
  // Get the last part after any slashes (the actual image name)
  const parts = withoutTag.split("/");
  const imageName = parts[parts.length - 1];
  
  return imageName || null;
}

/**
 * Generate a stable match name for container matching
 * This is used to populate the container_match_name column in the database.
 * 
 * The match name is:
 * 1. Lowercase
 * 2. Without leading slash
 * 3. Without instance numbers (e.g., -1, -2)
 * 
 * @param containerName - The container name from Docker
 * @returns A stable match name for database storage
 */
export function generateContainerMatchName(containerName: string | null | undefined): string {
  return getContainerBaseName(containerName);
}

/**
 * Check if two container names match
 * Uses base name comparison to handle instance numbers and case differences.
 * 
 * @param name1 - First container name
 * @param name2 - Second container name
 * @returns true if the base names match
 */
export function containerNamesMatch(
  name1: string | null | undefined,
  name2: string | null | undefined,
): boolean {
  const baseName1 = getContainerBaseName(name1);
  const baseName2 = getContainerBaseName(name2);
  
  if (!baseName1 || !baseName2) return false;
  
  return baseName1 === baseName2;
}

/**
 * Find a container from a list by matching against a shortcut's container_match_name
 * 
 * @param containers - Array of Docker containers with Names property
 * @param matchName - The container_match_name to find
 * @returns The matching container or undefined
 */
export function findContainerByMatchName<T extends { Names: string[] }>(
  containers: T[],
  matchName: string | null | undefined,
): T | undefined {
  if (!matchName) return undefined;
  
  const targetBaseName = getContainerBaseName(matchName);
  if (!targetBaseName) return undefined;
  
  return containers.find((c) => {
    const containerName = c.Names[0]?.replace(/^\//, "");
    return getContainerBaseName(containerName) === targetBaseName;
  });
}

