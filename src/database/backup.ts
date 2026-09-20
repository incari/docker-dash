/**
 * Database backups.
 *
 * Migrations rewrite tables and delete rows, and there are no down migrations:
 * once an upgrade has run, the previous state only exists in a copy. Taking one
 * automatically before migrating is what makes an upgrade reversible - restore
 * the file and run the older image.
 */

import fs from "node:fs";
import path from "node:path";
import { db, dbPath } from "../config/database.js";

const BACKUP_PREFIX = "dashboard.db.backup-";

/** How many automatic backups to keep before pruning the oldest. */
const KEEP = 5;

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").replace("Z", "");
}

export function backupPathFor(label: string): string {
  const dir = path.dirname(dbPath);
  return path.join(dir, `${BACKUP_PREFIX}${label}-${timestamp()}.db`);
}

/**
 * Copy the database using SQLite's own online backup API rather than a file
 * copy: the database is open and may have pending WAL content, which a plain
 * copy can miss or capture mid-write.
 */
export async function createBackup(label: string): Promise<string | null> {
  try {
    const destination = backupPathFor(label);
    await db.backup(destination);
    console.log("[BACKUP] Wrote", destination);
    prune();
    return destination;
  } catch (err) {
    // A backup failure must not stop the app from starting; it is a safety net,
    // not a precondition.
    console.error("[BACKUP] Could not create backup:", err);
    return null;
  }
}

/** Keep the most recent KEEP backups so they cannot grow without bound. */
function prune(): void {
  try {
    const dir = path.dirname(dbPath);
    const backups = fs
      .readdirSync(dir)
      .filter((name) => name.startsWith(BACKUP_PREFIX))
      .map((name) => ({
        name,
        mtime: fs.statSync(path.join(dir, name)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    for (const stale of backups.slice(KEEP)) {
      fs.unlinkSync(path.join(dir, stale.name));
      console.log("[BACKUP] Pruned old backup", stale.name);
    }
  } catch (err) {
    console.error("[BACKUP] Could not prune old backups:", err);
  }
}
