/**
 * The list of Docker hosts the dashboard reads, and what is known about their
 * reachability.
 *
 * The rows live in SQLite; the status does not - it is whatever the last
 * attempt to reach the host produced, so it resets when the process restarts
 * rather than telling the user a server is down because it was down yesterday.
 */

import { hostname } from "os";
import { db } from "../config/database.js";
import type { HostResponse, HostRow, HostStatus } from "../types/index.js";
import type { HostErrorCode } from "./client.js";
import { getAgentAccess } from "./agentAccess.js";

/** Row 1 is always the daemon this process reaches over its own socket. */
export const LOCAL_HOST_ID = 1;

const statuses = new Map<number, HostStatus>();

const UNKNOWN_STATUS: HostStatus = {
  online: false,
  checked_at: null,
  container_count: null,
  error: null,
  error_code: null,
  failures: 0,
  retry_after: null,
};

/**
 * How long a failing host is left alone before being tried again.
 *
 * A server that refuses a connection fails instantly, but one that is asleep or
 * behind a firewall that drops packets does not answer at all - and every read
 * of the dashboard then waited the full request timeout for it, measured at six
 * seconds, on a list the browser refreshes every five. Backing off keeps one
 * dead machine from setting the pace for the whole fleet.
 */
const BACKOFF_STEPS_MS = [5_000, 10_000, 20_000, 40_000, 60_000];

function backoffFor(failures: number): number {
  const index = Math.min(failures, BACKOFF_STEPS_MS.length) - 1;
  return BACKOFF_STEPS_MS[Math.max(index, 0)] as number;
}

/**
 * Make sure there is a local host to hang shortcuts off.
 *
 * The migration seeds it, but a database that predates the migration system or
 * one whose hosts table was emptied by hand would otherwise leave every
 * shortcut pointing at a row that does not exist.
 */
export function ensureLocalHost(): void {
  const existing = db
    .prepare("SELECT id FROM hosts WHERE id = ?")
    .get(LOCAL_HOST_ID);
  if (existing) return;

  db.prepare(
    `INSERT INTO hosts (id, name, type, position, enabled)
     VALUES (?, ?, 'local', 0, 1)`,
  ).run(LOCAL_HOST_ID, process.env.HOST_NAME || hostname() || "Local");
}

export function listHosts(): HostRow[] {
  return db
    .prepare("SELECT * FROM hosts ORDER BY position ASC, id ASC")
    .all() as HostRow[];
}

/** The hosts a container listing should actually fan out to. */
export function listEnabledHosts(): HostRow[] {
  return listHosts().filter((host) => host.enabled === 1);
}

export function getHost(id: number): HostRow | null {
  return (
    (db.prepare("SELECT * FROM hosts WHERE id = ?").get(id) as
      | HostRow
      | undefined) ?? null
  );
}

export function getHostStatus(id: number): HostStatus {
  return statuses.get(id) ?? { ...UNKNOWN_STATUS };
}

export function recordHostOnline(id: number, containerCount: number): void {
  statuses.set(id, {
    online: true,
    checked_at: new Date().toISOString(),
    container_count: containerCount,
    error: null,
    error_code: null,
    failures: 0,
    retry_after: null,
  });
}

export function recordHostOffline(
  id: number,
  error: string,
  errorCode: HostErrorCode,
): void {
  const failures = (statuses.get(id)?.failures ?? 0) + 1;

  statuses.set(id, {
    online: false,
    checked_at: new Date().toISOString(),
    container_count: null,
    error,
    error_code: errorCode,
    failures,
    retry_after: new Date(Date.now() + backoffFor(failures)).toISOString(),
  });
}

/**
 * Should this host be skipped for now?
 *
 * Only remote hosts are ever skipped. Reading the local socket costs nothing
 * when it fails, and backing off would mean a Docker daemon that has just come
 * back stays missing from the dashboard for up to a minute.
 */
export function isBackingOff(host: HostRow): boolean {
  if (host.type === "local") return false;

  const retryAfter = statuses.get(host.id)?.retry_after;
  if (!retryAfter) return false;

  return Date.parse(retryAfter) > Date.now();
}

/**
 * Try this host on the next read, whatever the backoff said.
 * What the user means by "it is back now".
 */
export function clearBackoff(id: number): void {
  const status = statuses.get(id);
  if (!status) return;
  statuses.set(id, { ...status, failures: 0, retry_after: null });
}

export function forgetHostStatus(id: number): void {
  statuses.delete(id);
}

/**
 * The hostname a port-based shortcut on this host should open.
 *
 * The local host answers null: the browser is already talking to that machine,
 * so its own hostname is the right one and stays right whether the dashboard is
 * reached over LAN, Tailscale or a tunnel. A remote host falls back to the
 * hostname in its URL, which is correct whenever the dashboard and the services
 * are published on the same address - the usual case.
 */
export function resolveHostHostname(host: HostRow): string | null {
  if (host.type === "local") return null;
  if (host.hostname && host.hostname.trim()) return host.hostname.trim();
  if (!host.url) return null;
  try {
    return new URL(host.url).hostname;
  } catch {
    return null;
  }
}

/** Strips the key and attaches the live status, ready to send to the browser. */
export function toHostResponse(host: HostRow): HostResponse {
  return {
    id: host.id,
    name: host.name,
    type: host.type,
    url: host.url,
    hostname: resolveHostHostname(host),
    color: host.color,
    position: host.position,
    enabled: host.enabled === 1,
    has_api_key: Boolean(host.api_key),
    status:
      host.enabled === 1
        ? getHostStatus(host.id)
        : { ...UNKNOWN_STATUS },
    // Only this machine's own card offers its key: it is the one the person in
    // front of the screen has to copy into a hub. Showing it here gives away
    // nothing they could not already do from this page, which has no login and
    // can already start and stop these containers.
    ...(host.type === "local" ? { agent: getAgentAccess() } : {}),
  };
}
