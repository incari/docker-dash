/**
 * Database configuration and initialization
 */

import Database, { Database as DatabaseType } from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path from environment or default
const dbPath =
  process.env.DB_PATH || path.join(__dirname, "../../data/dashboard.db");

// Create database instance
export const db: DatabaseType = new Database(dbPath);

// Enable foreign keys
db.pragma("foreign_keys = ON");

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
 * Graceful shutdown - close database connection
 */
export function closeDatabase(): void {
  try {
    db.close();
    console.log("[DATABASE] Connection closed");
  } catch (err) {
    console.error("[DATABASE] Error closing connection:", err);
  }
}

// Handle process termination
process.on("SIGTERM", closeDatabase);
process.on("SIGINT", closeDatabase);
