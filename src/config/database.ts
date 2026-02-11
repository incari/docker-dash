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

// Export database type for use in other modules
export type DatabaseInstance = DatabaseType;

/**
 * Initialize database schema (create tables if they don't exist)
 */
export function initializeSchema(): void {
  // Create shortcuts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS shortcuts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name TEXT NOT NULL,
      description TEXT,
      icon TEXT DEFAULT 'cube',
      port INTEGER,
      url TEXT,
      container_id TEXT,
      is_favorite INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create sections table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      is_collapsed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      theme_primary TEXT DEFAULT '#3b82f6',
      theme_background TEXT DEFAULT '#0f172a',
      view_mode TEXT DEFAULT 'default',
      mobile_columns INTEGER DEFAULT 2,
      migration_dismissed INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
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
