/**
 * Client-side port selection.
 *
 * Mirrors the backend preference (`selectPublishedPort` /
 * `orderPortsForDisplay` in `src/utils/containerMatching.ts`): Docker reports
 * ports in arbitrary order, so `ports[0]` is frequently the wrong one (e.g. a
 * peer/data port listed before the web UI). The API now sends `ports` already
 * ordered, but this keeps every `ports[0]`-style call site correct even with
 * stale cached data or an older backend.
 */

interface PortLike {
  private: number;
  public?: number | null;
  type?: string | null;
}

/**
 * Private ports that conventionally serve a web UI, most preferred first.
 * Kept in sync with the backend list.
 */
const WEB_UI_PRIVATE_PORTS = [80, 8080, 8000, 3000, 5000, 8081, 8008, 443, 8443];

function webUiRank(privatePort: number): number {
  const index = WEB_UI_PRIVATE_PORTS.indexOf(privatePort);
  return index === -1 ? WEB_UI_PRIVATE_PORTS.length : index;
}

function isTcp(port: PortLike): boolean {
  return (port.type || "tcp").toLowerCase() === "tcp";
}

function publishedPorts<T extends PortLike>(ports: T[] | null | undefined): T[] {
  if (!ports) return [];
  return ports.filter(
    (p) => p && typeof p.public === "number" && (p.public as number) > 0,
  );
}

/**
 * The host port a shortcut should open, or null when the container publishes
 * nothing. Prefers TCP, then a conventional web-UI private port, then the
 * lowest private port, then the lowest host port (deterministic).
 */
export function selectBestContainerPort<T extends PortLike>(
  ports: T[] | null | undefined,
): number | null {
  const published = publishedPorts(ports);
  if (published.length === 0) return null;

  const tcp = published.filter(isTcp);
  const candidates = tcp.length > 0 ? tcp : published;

  const best = [...candidates].sort((a, b) => {
    const rankDiff = webUiRank(a.private) - webUiRank(b.private);
    if (rankDiff !== 0) return rankDiff;
    if (a.private !== b.private) return a.private - b.private;
    return (a.public as number) - (b.public as number);
  })[0];

  return best.public as number;
}

/**
 * Published ports ordered best-first, for dropdowns that list every port.
 */
export function orderContainerPorts<T extends PortLike>(
  ports: T[] | null | undefined,
): number[] {
  const published = publishedPorts(ports);
  const tcp = published.filter(isTcp);
  const candidates = tcp.length > 0 ? tcp : published;

  const seen = new Set<number>();
  const ordered: number[] = [];
  for (const p of [...candidates].sort((a, b) => {
    const rankDiff = webUiRank(a.private) - webUiRank(b.private);
    if (rankDiff !== 0) return rankDiff;
    if (a.private !== b.private) return a.private - b.private;
    return (a.public as number) - (b.public as number);
  })) {
    const hostPort = p.public as number;
    if (!seen.has(hostPort)) {
      seen.add(hostPort);
      ordered.push(hostPort);
    }
  }
  return ordered;
}
