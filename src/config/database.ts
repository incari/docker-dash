/**
 * Database configuration and initialization
 */

import Database, { Database as DatabaseType } from "better-sqlite3";
import path from "path";
import { hostname } from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path from environment or default
export const dbPath =
  process.env.DB_PATH || path.join(__dirname, "../../data/dashboard.db");

// Create database instance
export const db: DatabaseType = new Database(dbPath);

// Enable foreign keys
db.pragma("foreign_keys = ON");

/**
 * Write-ahead logging, so a reader is never blocked by a writer.
 *
 * Two processes end up on the same file more often than it looks: an update
 * starts the new container before the old one has exited, and running the dev
 * server against the live data directory does the same thing. Without WAL one
 * of them fails outright; with it they take turns.
 *
 * WAL is unavailable on some network filesystems, where SQLite quietly stays in
 * its previous mode - hence the check rather than a bare call.
 */
try {
  const mode = db.pragma("journal_mode = WAL", { simple: true });
  if (String(mode).toLowerCase() !== "wal") {
    console.warn(
      `[DATABASE] Write-ahead logging is not available here (mode: ${mode}).`,
    );
  }
} catch (err) {
  console.warn("[DATABASE] Could not enable write-ahead logging:", err);
}

// Wait for a lock rather than failing immediately: the other holder is another
// docker-dash on the same volume, and it is about to finish.
db.pragma("busy_timeout = 5000");

// Export database type for use in other modules
export type DatabaseInstance = DatabaseType;

/**
 * Initialize database schema (create tables if they don't exist)
 * This represents the CURRENT expected schema - migrations handle upgrades
 */
export function initializeSchema(): void {
  // Create migrations tracking table FIRST
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      executed_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create hosts table. Row 1 is always the Docker daemon this process talks
  // to over its own socket; every other daemon is a 'docker' row reached at
  // its API over ssh:// or tcp://.
  db.exec(`
    CREATE TABLE IF NOT EXISTS hosts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'docker',
      url TEXT,
      hostname TEXT,
      color TEXT,
      position INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Shortcuts carry a host_id that defaults to 1, so row 1 has to exist before
  // anything can be written to that table.
  db.prepare(
    `INSERT OR IGNORE INTO hosts (id, name, type, position, enabled)
     VALUES (1, ?, 'local', 0, 1)`,
  ).run(process.env.HOST_NAME || hostname() || "Local");

  // Create sections table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      is_collapsed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create shortcuts table with all current columns
  db.exec(`
    CREATE TABLE IF NOT EXISTS shortcuts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host_id INTEGER NOT NULL DEFAULT 1 REFERENCES hosts(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      description TEXT,
      icon TEXT DEFAULT 'Server',
      icon_type TEXT,
      port INTEGER,
      url TEXT,
      container_id TEXT,
      container_name TEXT,
      container_match_name TEXT,
      compose_project TEXT,
      section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL,
      position INTEGER DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      use_tailscale INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Remembers containers whose shortcut the user deleted. Auto-sync would
  // otherwise recreate a shortcut for every running container on the next
  // startup, so a deliberate deletion could never stick.
  db.exec(`
    CREATE TABLE IF NOT EXISTS dismissed_containers (
      host_id INTEGER NOT NULL DEFAULT 1,
      container_match_name TEXT NOT NULL,
      display_name TEXT,
      dismissed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (host_id, container_match_name)
    )
  `);

  // Create settings table (singleton pattern)
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      theme_primary TEXT DEFAULT '#3b82f6',
      theme_background TEXT DEFAULT '#0f172a',
      view_mode TEXT DEFAULT 'default',
      mobile_columns INTEGER DEFAULT 2,
      migration_dismissed INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes for performance (IF NOT EXISTS is implicit for CREATE INDEX)
  try {
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_shortcuts_section_position ON shortcuts(section_id, position)`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_shortcuts_container_match ON shortcuts(container_match_name)`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_sections_position ON sections(position)`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_shortcuts_host ON shortcuts(host_id)`,
    );
  } catch {
    // Indexes may already exist, ignore errors
  }
}

/**
 * Get table info for a given table
 */
export function getTableInfo(
  tableName: string,
): Array<{ name: string; notnull: number }> {
  return db.pragma(`table_info(${tableName})`) as Array<{
    name: string;
    notnull: number;
  }>;
}

/**
 * Check if a column exists in a table
 */
export function columnExists(tableName: string, columnName: string): boolean {
  const tableInfo = getTableInfo(tableName);
  return tableInfo.some((col) => col.name === columnName);
}

/**
 * Check if a migration has already been executed
 */
export function hasMigrationRun(migrationName: string): boolean {
  try {
    const result = db
      .prepare("SELECT 1 FROM migrations WHERE name = ?")
      .get(migrationName);
    return !!result;
  } catch {
    // Table might not exist yet
    return false;
  }
}

/**
 * Record that a migration has been executed
 */
export function recordMigration(migrationName: string): void {
  try {
    db.prepare("INSERT OR IGNORE INTO migrations (name) VALUES (?)").run(
      migrationName,
    );
  } catch (err) {
    console.error(
      `[MIGRATION] Failed to record migration ${migrationName}:`,
      err,
    );
  }
}

/**
 * Check if a table exists
 */
export function tableExists(tableName: string): boolean {
  const result = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(tableName);
  return !!result;
}

/**
 * Can the database still be read?
 *
 * Used by the health endpoint. A dashboard whose database has gone away answers
 * every request with an error, and until this existed it still reported itself
 * healthy, so nothing ever restarted it.
 */
export function isDatabaseHealthy(): boolean {
  try {
    db.prepare("SELECT 1").get();
    return true;
  } catch {
    return false;
  }
}

/**
 * Close the database connection.
 *
 * Called from the shutdown sequence in server.ts, after the HTTP server has
 * stopped accepting requests. It used to be wired straight to SIGTERM, which
 * was worse than doing nothing: installing a signal listener removes Node's
 * default exit, so the process stayed up with a closed database and answered
 * every request with an error until Docker gave up and killed it.
 */
export function closeDatabase(): void {
  try {
    db.close();
    console.log("[DATABASE] Connection closed");
  } catch (err) {
    console.error("[DATABASE] Error closing connection:", err);
  }
}
