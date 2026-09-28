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

/**
 * A port entry as Docker reports it in `listContainers`.
 * `PublicPort` is absent for ports that are exposed but not published.
 */
export interface ContainerPortInfo {
  PrivatePort: number;
  PublicPort?: number;
  Type?: string;
}

/**
 * Private ports that conventionally serve a web UI, most preferred first.
 * A container often publishes several ports (a UI plus a peer/data/metrics
 * port) and only the UI one is worth putting behind a shortcut.
 */
const WEB_UI_PRIVATE_PORTS = [80, 8080, 8000, 3000, 5000, 8081, 8008, 443, 8443];

/**
 * Every distinct host port a container actually publishes.
 *
 * Docker repeats an entry per listening address (0.0.0.0 and ::) and per
 * protocol, so the raw array contains duplicates.
 */
export function getPublishedPorts(
  ports: ContainerPortInfo[] | null | undefined,
): number[] {
  if (!ports) return [];

  const published = ports
    .filter((p) => typeof p.PublicPort === "number" && p.PublicPort > 0)
    .map((p) => p.PublicPort as number);

  return [...new Set(published)];
}

/**
 * Preference order among published entries, shared by selectPublishedPort
 * (auto-sync) and orderPortsForDisplay (the list the browser receives), so
 * both agree on which port a shortcut should open.
 *
 *   1. TCP over UDP (a UDP-only service has no web UI to link to)
 *   2. a conventional web-UI private port, in WEB_UI_PRIVATE_PORTS order
 *   3. the lowest private port - UIs sit below peer/data ports by convention
 *   4. the lowest host port, purely so the result is deterministic
 */
function webUiRank(privatePort: number): number {
  const index = WEB_UI_PRIVATE_PORTS.indexOf(privatePort);
  return index === -1 ? WEB_UI_PRIVATE_PORTS.length : index;
}

function isTcp(port: { Type?: string }): boolean {
  return (port.Type || "tcp").toLowerCase() === "tcp";
}

/** A published port in the shape the browser receives. */
export interface DisplayPort {
  private: number;
  public: number;
  type?: string;
}

/**
 * Published ports ordered so the first entry is the one a shortcut should
 * open. Same preference as selectPublishedPort, plus dedupe: Docker repeats an
 * entry per listening address and per protocol, so entries sharing a host port
 * collapse into one, preferring the TCP row. When TCP rows exist, UDP rows are
 * dropped: a shortcut cannot open a UDP port, and the host port stays listed
 * through its TCP row (or on its own when the service is UDP-only).
 */
export function orderPortsForDisplay(
  ports: ContainerPortInfo[] | null | undefined,
): DisplayPort[] {
  if (!ports) return [];

  const byPublic = new Map<number, ContainerPortInfo>();
  for (const p of ports) {
    if (!p || typeof p.PublicPort !== "number" || p.PublicPort <= 0) continue;
    const prev = byPublic.get(p.PublicPort);
    if (!prev) {
      byPublic.set(p.PublicPort, p);
    } else if (!isTcp(prev) && isTcp(p)) {
      byPublic.set(p.PublicPort, p);
    }
  }

  const deduped = [...byPublic.values()];
  const tcp = deduped.filter(isTcp);
  const candidates = tcp.length > 0 ? tcp : deduped;

  return candidates
    .map((p) => ({
      private: p.PrivatePort,
      public: p.PublicPort as number,
      type: p.Type,
    }))
    .sort((a, b) => {
      const rankDiff = webUiRank(a.private) - webUiRank(b.private);
      if (rankDiff !== 0) return rankDiff;
      if (a.private !== b.private) return a.private - b.private;
      return a.public - b.public;
    });
}
/**
 * Pick the host port a shortcut should open.
 *
 * `Ports[0]` is not usable: Docker returns the array in arbitrary order and the
 * first entry is frequently an exposed-but-unpublished port (no PublicPort at
 * all) or the wrong one of several published ports. Observed on a real server:
 * coolify lists 7000/tcp unpublished first and publishes its UI on 8080 -> 7000,
 * and transmission lists the BitTorrent peer port 51413 before the 9091 web UI.
 */
export function selectPublishedPort(
  ports: ContainerPortInfo[] | null | undefined,
): number | null {
  if (!ports || ports.length === 0) return null;

  const published = ports.filter(
    (p) => typeof p.PublicPort === "number" && p.PublicPort > 0,
  );
  if (published.length === 0) return null;

  const tcp = published.filter(isTcp);
  const candidates = tcp.length > 0 ? tcp : published;

  const best = [...candidates].sort((a, b) => {
    const rankDiff = webUiRank(a.PrivatePort) - webUiRank(b.PrivatePort);
    if (rankDiff !== 0) return rankDiff;
    if (a.PrivatePort !== b.PrivatePort) return a.PrivatePort - b.PrivatePort;
    return (a.PublicPort as number) - (b.PublicPort as number);
  })[0];

  return best.PublicPort as number;
}
