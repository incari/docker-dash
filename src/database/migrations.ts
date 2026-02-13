/**
 * Database migrations for Docker Dashboard
 *
 * Migration system with version tracking to ensure migrations only run once.
 */

import {
  db,
  columnExists,
  getTableInfo,
  hasMigrationRun,
  recordMigration,
} from "../config/database.js";
import Docker from "dockerode";

const docker = new Docker({
  socketPath: process.env.DOCKER_SOCKET || "/var/run/docker.sock",
});

/**
 * Run a migration only if it hasn't been run before
 */
function runOnce(name: string, migrationFn: () => void): void {
  if (hasMigrationRun(name)) {
    return;
  }
  try {
    console.log(`[MIGRATION] Running: ${name}`);
    migrationFn();
    recordMigration(name);
    console.log(`[MIGRATION] Completed: ${name}`);
  } catch (err) {
    console.error(`[MIGRATION] Failed: ${name}`, err);
  }
}

/**
 * Run an async migration only if it hasn't been run before
 */
async function runOnceAsync(
  name: string,
  migrationFn: () => Promise<void>,
): Promise<void> {
  if (hasMigrationRun(name)) {
    return;
  }
  try {
    console.log(`[MIGRATION] Running: ${name}`);
    await migrationFn();
    recordMigration(name);
    console.log(`[MIGRATION] Completed: ${name}`);
  } catch (err) {
    console.error(`[MIGRATION] Failed: ${name}`, err);
  }
}

/**
 * Run all migrations
 */
export async function runMigrations(): Promise<void> {
  console.log("[MIGRATIONS] Starting database migrations...");

  // Legacy column migrations (for existing databases)
  addColumnIfMissing("shortcuts", "url", "TEXT");
  addColumnIfMissing("shortcuts", "container_id", "TEXT");
  addColumnIfMissing("shortcuts", "is_favorite", "INTEGER DEFAULT 0");
  addColumnIfMissing("shortcuts", "use_tailscale", "INTEGER DEFAULT 0");
  addColumnIfMissing("shortcuts", "section_id", "INTEGER");
  addColumnIfMissing("shortcuts", "icon_type", "TEXT");
  addColumnIfMissing("shortcuts", "compose_project", "TEXT");
  addColumnIfMissing("shortcuts", "container_name", "TEXT");
  addColumnIfMissing("settings", "migration_dismissed", "INTEGER DEFAULT 0");

  // Position migration
  runOnce("001_add_position_column", migratePositionColumn);

  // Display name migration
  runOnce("002_add_display_name_column", migrateDisplayNameColumn);

  // Container name migration (async - needs Docker)
  await runOnceAsync("003_migrate_container_names", migrateContainerNameColumn);

  // Duplicate cleanup
  runOnce("004_cleanup_duplicates", cleanupDuplicates);

  // Container base name migration
  runOnce("005_normalize_container_base_names", migrateContainerBaseName);

  // Remove name column (final step)
  runOnce("006_remove_name_column", removeNameColumn);

  // Port nullable migration
  runOnce("007_make_port_nullable", migratePortNullable);

  // NEW: Add container_match_name column and populate it
  runOnce("008_add_container_match_name", migrateContainerMatchName);

  // NEW: Add database indexes
  runOnce("009_add_indexes", addDatabaseIndexes);

  // NEW: Clean up deprecated columns (container_id is unreliable)
  runOnce("010_cleanup_deprecated_columns", cleanupDeprecatedColumns);

  console.log("[MIGRATIONS] All migrations complete");
}

function addColumnIfMissing(table: string, column: string, type: string): void {
  if (!columnExists(table, column)) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      console.log(`[MIGRATION] Added ${column} column to ${table}`);
    } catch (err) {
      console.error(`[MIGRATION] Failed to add ${column} column:`, err);
    }
  }
}

function migratePositionColumn(): void {
  if (!columnExists("shortcuts", "position")) {
    try {
      db.exec("ALTER TABLE shortcuts ADD COLUMN position INTEGER DEFAULT 0");
      const shortcuts = db
        .prepare("SELECT id FROM shortcuts ORDER BY display_name")
        .all() as Array<{ id: number }>;
      const updateStmt = db.prepare(
        "UPDATE shortcuts SET position = ? WHERE id = ?",
      );
      shortcuts.forEach((shortcut, index) => {
        updateStmt.run(index, shortcut.id);
      });
      console.log(
        "[MIGRATION] Added position column and initialized positions",
      );
    } catch (err) {
      console.error("[MIGRATION] Failed to add position column:", err);
    }
  }
}

function migrateDisplayNameColumn(): void {
  if (!columnExists("shortcuts", "display_name")) {
    try {
      db.exec("ALTER TABLE shortcuts ADD COLUMN display_name TEXT");
      const result = db
        .prepare(
          "UPDATE shortcuts SET display_name = name WHERE display_name IS NULL",
        )
        .run();
      console.log(
        `[MIGRATION] Added display_name column and copied ${result.changes} names`,
      );
    } catch (err) {
      console.error("[MIGRATION] Failed to add display_name column:", err);
    }
  }
}

async function migrateContainerNameColumn(): Promise<void> {
  if (!columnExists("shortcuts", "container_name")) {
    try {
      db.exec("ALTER TABLE shortcuts ADD COLUMN container_name TEXT");
      console.log("[MIGRATION] Added container_name column");

      // Try to match existing shortcuts with Docker containers
      await matchContainersWithDocker();
    } catch (err) {
      console.error("[MIGRATION] Failed to add container_name column:", err);
    }
  }
}

async function matchContainersWithDocker(): Promise<void> {
  const normalizeForMatching = (name: string | null): string => {
    if (!name) return "";
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .trim();
  };

  try {
    const shortcutsWithContainerId = db
      .prepare(
        "SELECT id, display_name, container_id FROM shortcuts WHERE container_id IS NOT NULL AND container_name IS NULL",
      )
      .all() as Array<{
      id: number;
      display_name: string;
      container_id: string;
    }>;

    if (shortcutsWithContainerId.length === 0) return;

    console.log(
      `[MIGRATION] Found ${shortcutsWithContainerId.length} shortcuts to migrate`,
    );

    let dockerContainers: Docker.ContainerInfo[] = [];
    try {
      dockerContainers = await docker.listContainers({ all: true });
    } catch {
      console.warn("[MIGRATION] Docker not available, using fallback");
      const fallbackStmt = db.prepare(
        "UPDATE shortcuts SET container_name = display_name WHERE container_id IS NOT NULL AND container_name IS NULL",
      );
      fallbackStmt.run();
      return;
    }

    const updateStmt = db.prepare(
      "UPDATE shortcuts SET container_name = ? WHERE id = ?",
    );

    for (const shortcut of shortcutsWithContainerId) {
      let containerName: string | null = null;

      // Method 1: Match by container_id
      const matchById = dockerContainers.find(
        (c) =>
          c.Id === shortcut.container_id ||
          c.Id.startsWith(shortcut.container_id),
      );
      if (matchById) {
        containerName = matchById.Names[0].replace(/^\//, "");
      }

      // Method 2: Fuzzy matching by name
      if (!containerName) {
        const normalizedShortcutName = normalizeForMatching(
          shortcut.display_name,
        );
        for (const container of dockerContainers) {
          const dockerName = container.Names[0].replace(/^\//, "");
          const normalizedDockerName = normalizeForMatching(dockerName);
          if (
            normalizedShortcutName.includes(normalizedDockerName) ||
            normalizedDockerName.includes(normalizedShortcutName)
          ) {
            containerName = dockerName;
            break;
          }
        }
      }

      if (containerName) {
        updateStmt.run(
          containerName.replace(/-\d+$/, "").toLowerCase(),
          shortcut.id,
        );
      }
    }
  } catch (err) {
    console.error("[MIGRATION] Failed to match containers:", err);
  }
}

function cleanupDuplicates(): void {
  try {
    console.log("[DUPLICATE-CLEANUP] Checking for duplicate shortcuts...");

    const allShortcuts = db
      .prepare(
        "SELECT id, display_name, container_name, container_id, is_favorite, icon, description FROM shortcuts WHERE container_name IS NOT NULL ORDER BY id ASC",
      )
      .all() as Array<{
      id: number;
      display_name: string;
      container_name: string;
      container_id: string | null;
      is_favorite: number;
      icon: string | null;
      description: string | null;
    }>;

    const containerNameGroups = new Map<string, typeof allShortcuts>();
    for (const shortcut of allShortcuts) {
      if (shortcut.container_name) {
        const key = shortcut.container_name.toLowerCase();
        if (!containerNameGroups.has(key)) {
          containerNameGroups.set(key, []);
        }
        containerNameGroups.get(key)!.push(shortcut);
      }
    }

    let mergedCount = 0;
    let deletedCount = 0;

    for (const [containerName, shortcuts] of containerNameGroups) {
      if (shortcuts.length > 1) {
        console.log(
          `[DUPLICATE-CLEANUP] Found ${shortcuts.length} duplicates for "${containerName}"`,
        );

        const sortedShortcuts = [...shortcuts].sort((a, b) => {
          if (a.is_favorite !== b.is_favorite)
            return b.is_favorite - a.is_favorite;
          const aHasCustomIcon = a.icon && a.icon !== "Server" ? 1 : 0;
          const bHasCustomIcon = b.icon && b.icon !== "Server" ? 1 : 0;
          if (aHasCustomIcon !== bHasCustomIcon)
            return bHasCustomIcon - aHasCustomIcon;
          const aHasDesc = a.description?.trim() ? 1 : 0;
          const bHasDesc = b.description?.trim() ? 1 : 0;
          if (aHasDesc !== bHasDesc) return bHasDesc - aHasDesc;
          return a.id - b.id;
        });

        const deleteShortcuts = sortedShortcuts.slice(1);
        const deleteStmt = db.prepare("DELETE FROM shortcuts WHERE id = ?");
        for (const shortcut of deleteShortcuts) {
          deleteStmt.run(shortcut.id);
          deletedCount++;
        }
        mergedCount++;
      }
    }

    if (mergedCount > 0) {
      console.log(
        `[DUPLICATE-CLEANUP] Deleted ${deletedCount} duplicates from ${mergedCount} groups`,
      );
    }
  } catch (err) {
    console.error("[DUPLICATE-CLEANUP] Failed:", err);
  }
}

function migrateContainerBaseName(): void {
  try {
    const getBaseName = (name: string): string =>
      name.replace(/-\d+$/, "").toLowerCase();

    const shortcuts = db
      .prepare(
        "SELECT id, container_name FROM shortcuts WHERE container_name IS NOT NULL",
      )
      .all() as Array<{ id: number; container_name: string }>;

    const updateStmt = db.prepare(
      "UPDATE shortcuts SET container_name = ? WHERE id = ?",
    );
    let updated = 0;

    for (const shortcut of shortcuts) {
      const baseName = getBaseName(shortcut.container_name);
      if (baseName !== shortcut.container_name.toLowerCase()) {
        updateStmt.run(baseName, shortcut.id);
        updated++;
      }
    }

    if (updated > 0) {
      console.log(`[MIGRATION] Updated ${updated} shortcuts to use base names`);
    }
  } catch (err) {
    console.error("[MIGRATION] Failed to migrate base names:", err);
  }
}

function removeNameColumn(): void {
  const tableInfo = getTableInfo("shortcuts");
  if (tableInfo.some((c) => c.name === "name")) {
    try {
      console.log("[MIGRATION] Removing name column...");
      db.prepare(
        "UPDATE shortcuts SET display_name = name WHERE display_name IS NULL OR display_name = ''",
      ).run();

      db.transaction(() => {
        // Get columns from old table, excluding 'name'
        const oldTableCols = getTableInfo("shortcuts")
          .map((c) => c.name)
          .filter((c) => c !== "name");

        db.exec("ALTER TABLE shortcuts RENAME TO shortcuts_old");

        // Create new table with ALL current columns (including compose_project, container_match_name)
        db.exec(`
          CREATE TABLE shortcuts (
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
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            original_container_name TEXT
          )
        `);

        // Only copy columns that exist in BOTH old and new tables
        const newTableCols = getTableInfo("shortcuts").map((c) => c.name);
        const colsToCopy = oldTableCols.filter((c) => newTableCols.includes(c));
        const colsStr = colsToCopy.join(", ");

        db.exec(
          `INSERT INTO shortcuts (${colsStr}) SELECT ${colsStr} FROM shortcuts_old`,
        );
        db.exec("DROP TABLE shortcuts_old");
      })();

      console.log("[MIGRATION] Removed name column");
    } catch (err) {
      console.error("[MIGRATION] Failed to remove name column:", err);
    }
  }
}

function migratePortNullable(): void {
  const tableInfo = getTableInfo("shortcuts");
  const portCol = tableInfo.find((c) => c.name === "port");
  if (portCol && portCol.notnull === 1) {
    try {
      console.log("[MIGRATION] Making port column nullable...");
      db.transaction(() => {
        // Get columns from old table BEFORE renaming
        const oldCols = getTableInfo("shortcuts").map((c) => c.name);

        db.exec("ALTER TABLE shortcuts RENAME TO shortcuts_old");

        // Create new table with ALL current columns (including compose_project, container_match_name)
        db.exec(`
          CREATE TABLE shortcuts (
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
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            original_container_name TEXT
          )
        `);

        // Only copy columns that exist in BOTH old and new tables
        const newCols = getTableInfo("shortcuts").map((c) => c.name);
        const colsToCopy = oldCols.filter((c) => newCols.includes(c));
        const colsStr = colsToCopy.join(", ");

        db.exec(
          `INSERT INTO shortcuts (${colsStr}) SELECT ${colsStr} FROM shortcuts_old`,
        );
        db.exec("DROP TABLE shortcuts_old");
      })();
      console.log("[MIGRATION] Port column is now nullable");
    } catch (err) {
      console.error("[MIGRATION] Failed to make port nullable:", err);
    }
  }
}

/**
 * Migration 008: Add container_match_name column
 * This column stores a normalized, stable identifier for matching containers
 * It's populated from container_name using the same normalization logic
 */
function migrateContainerMatchName(): void {
  // Add the column if missing
  if (!columnExists("shortcuts", "container_match_name")) {
    try {
      db.exec("ALTER TABLE shortcuts ADD COLUMN container_match_name TEXT");
      console.log("[MIGRATION] Added container_match_name column");
    } catch (err) {
      console.error("[MIGRATION] Failed to add container_match_name:", err);
      return;
    }
  }

  // Populate from existing container_name (ONLY for container-linked shortcuts)
  try {
    // Only get shortcuts that have a container_name but no container_match_name yet
    // Custom links (no container_name) should NOT have container_match_name
    const shortcuts = db
      .prepare(
        "SELECT id, container_name FROM shortcuts WHERE container_match_name IS NULL AND container_name IS NOT NULL",
      )
      .all() as Array<{
      id: number;
      container_name: string;
    }>;

    if (shortcuts.length === 0) {
      console.log("[MIGRATION] No shortcuts need container_match_name update");
      return;
    }

    const updateStmt = db.prepare(
      "UPDATE shortcuts SET container_match_name = ? WHERE id = ?",
    );

    let updated = 0;
    for (const shortcut of shortcuts) {
      // Only use container_name - never fall back to display_name
      // This ensures custom links (without container_name) don't get a container_match_name
      const sourceName = shortcut.container_name;
      if (sourceName) {
        // Normalize: lowercase, remove instance numbers
        const matchName = sourceName
          .toLowerCase()
          .replace(/^\//, "") // Remove leading slash
          .replace(/-\d+$/, "") // Remove instance numbers
          .trim();

        if (matchName) {
          updateStmt.run(matchName, shortcut.id);
          updated++;
        }
      }
    }

    console.log(
      `[MIGRATION] Populated container_match_name for ${updated} shortcuts`,
    );
  } catch (err) {
    console.error("[MIGRATION] Failed to populate container_match_name:", err);
  }
}

/**
 * Migration 009: Add database indexes for performance
 */
function addDatabaseIndexes(): void {
  const indexes = [
    {
      name: "idx_shortcuts_section_position",
      sql: "CREATE INDEX IF NOT EXISTS idx_shortcuts_section_position ON shortcuts(section_id, position)",
    },
    {
      name: "idx_shortcuts_container_match",
      sql: "CREATE INDEX IF NOT EXISTS idx_shortcuts_container_match ON shortcuts(container_match_name)",
    },
    {
      name: "idx_sections_position",
      sql: "CREATE INDEX IF NOT EXISTS idx_sections_position ON sections(position)",
    },
  ];

  for (const index of indexes) {
    try {
      db.exec(index.sql);
      console.log(`[MIGRATION] Created index: ${index.name}`);
    } catch (err) {
      // Index might already exist
      console.log(`[MIGRATION] Index ${index.name} already exists or failed`);
    }
  }
}

/**
 * Migration 010: Cleanup deprecated columns
 * Note: We keep container_id for now as some features may still reference it
 * but we document that it's unreliable and should not be used for matching
 *
 * This migration removes the unused original_container_name column
 */
function cleanupDeprecatedColumns(): void {
  const tableInfo = getTableInfo("shortcuts");
  const hasOriginalContainerName = tableInfo.some(
    (c) => c.name === "original_container_name",
  );

  if (!hasOriginalContainerName) {
    console.log("[MIGRATION] No deprecated columns to clean up");
    return;
  }

  try {
    console.log("[MIGRATION] Removing original_container_name column...");

    db.transaction(() => {
      // Get current columns excluding the one we want to remove
      const currentColumns = getTableInfo("shortcuts")
        .map((c) => c.name)
        .filter((c) => c !== "original_container_name");

      db.exec("ALTER TABLE shortcuts RENAME TO shortcuts_old");

      // Create new table with updated schema (including container_match_name)
      db.exec(`
        CREATE TABLE shortcuts (
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

      // Build list of columns that exist in both old and new tables
      const newTableCols = getTableInfo("shortcuts").map((c) => c.name);
      const colsToCopy = currentColumns.filter((c) => newTableCols.includes(c));
      const colsStr = colsToCopy.join(", ");

      db.exec(
        `INSERT INTO shortcuts (${colsStr}) SELECT ${colsStr} FROM shortcuts_old`,
      );
      db.exec("DROP TABLE shortcuts_old");

      // Recreate indexes
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_shortcuts_section_position ON shortcuts(section_id, position)",
      );
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_shortcuts_container_match ON shortcuts(container_match_name)",
      );
    })();

    console.log("[MIGRATION] Removed original_container_name column");
  } catch (err) {
    console.error("[MIGRATION] Failed to cleanup deprecated columns:", err);
  }
}
