/**
 * When the dashboard last brought containers onto itself, and what came of it.
 *
 * Auto-sync runs on every dashboard load, which was cheap when it read one
 * Docker socket. Reading a fleet is not: it contacts every server, deliberately
 * bypassing the container cache, and looks an icon up over the network for each
 * new container. Opening five tabs used to mean five full sweeps, queued behind
 * each other by the sync lock.
 *
 * So a recent result is reused. What "recent" must not mean is "since you added
 * a server" - anything that changes which containers exist clears this, and the
 * next load does the real work.
 */

export interface AutoSyncResult {
  success: true;
  created: number;
  updated: number;
  skipped: number;
  total: number;
  message: string;
}

const MIN_INTERVAL_MS = parseInt(
  process.env.AUTO_SYNC_INTERVAL_MS || "60000",
  10,
);

let last: { at: number; result: AutoSyncResult } | null = null;

/** The previous result, if it is recent enough to stand in for a new sweep. */
export function recentAutoSync(): AutoSyncResult | null {
  if (!last) return null;
  if (Date.now() - last.at >= MIN_INTERVAL_MS) return null;
  return last.result;
}

export function rememberAutoSync(result: AutoSyncResult): void {
  last = { at: Date.now(), result };
}

/** Something changed that a sweep has to see: sync for real next time. */
export function invalidateAutoSync(): void {
  last = null;
}
