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
import { createBackup } from "./backup.js";
import { getContainerBaseName } from "../utils/containerMatching.js";
import { hostname } from "os";
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
/** Migrations that rewrite tables or delete rows, in the order they run. */
const MIGRATION_NAMES = [
  "001_add_position_column",
  "002_add_display_name_column",
  // Must match the name passed to runOnceAsync below, or this list reports a
  // pending migration on every boot and a pointless backup is taken each time.
  "003_migrate_container_names",
  "004_cleanup_duplicates",
  "005_normalize_container_base_names",
  "006_remove_name_column",
  "007_make_port_nullable",
  "008_add_container_match_name",
  "009_add_indexes",
  "010_cleanup_deprecated_columns",
  "011_add_dismissed_containers",
  "012_merge_duplicate_shortcuts",
  "013_add_hosts",
  "014_add_agent_access",
];

export async function runMigrations(): Promise<void> {
  console.log("[MIGRATIONS] Starting database migrations...");

  // Back up before anything is rewritten. Several migrations drop and rebuild
  // tables and 004 deletes rows outright, and there are no down migrations, so
  // this copy is the only way back to the previous state.
  const pending = MIGRATION_NAMES.filter((name) => !hasMigrationRun(name));
  if (pending.length > 0) {
    console.log(
      `[MIGRATIONS] ${pending.length} pending; backing up first:`,
      pending.join(", "),
    );
    await createBackup("premigration");
  }

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

  // NEW: Remember shortcuts the user deleted so auto-sync stops recreating them
  runOnce("011_add_dismissed_containers", addDismissedContainersTable);

  // NEW: Merge shortcuts that describe the same app
  runOnce("012_merge_duplicate_shortcuts", mergeDuplicateShortcuts);

  // NEW: Multi-host - every shortcut now belongs to a server
  runOnce("013_add_hosts", addHostsTable);

  // NEW: This installation can be read by a hub, once switched on
  runOnce("014_add_agent_access", addAgentAccessColumns);

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

/**
 * Migration 011: Remember containers whose shortcut was deleted
 *
 * Auto-sync creates a shortcut for every container that does not have one, so
 * before this table a deliberately deleted shortcut came straight back on the
 * next startup and could not be removed at all. The row is keyed by
 * container_match_name - the same stable identifier auto-sync matches on - so a
 * dismissal survives the container being recreated under a new name.
 */
function addDismissedContainersTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dismissed_containers (
      container_match_name TEXT PRIMARY KEY,
      display_name TEXT,
      dismissed_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("[MIGRATION] Created dismissed_containers table");
}

/**
 * Migration 014: Let this installation hand out its own API key.
 *
 * The key used to come only from the environment, which meant generating a
 * secret by hand on every machine before the hub could read any of them. Now
 * each installation keeps one it generated itself, ready to be copied out of
 * its own dashboard - and still refuses every request until agent_enabled says
 * otherwise.
 */
function addAgentAccessColumns(): void {
  addColumnIfMissing("settings", "api_key", "TEXT");
  addColumnIfMissing("settings", "agent_enabled", "INTEGER DEFAULT 0");
}

/**
 * Migration 013: Give every shortcut a server.
 *
 * Until now the dashboard read one Docker daemon over its own socket and
 * nothing recorded where a container lived, because there was only one answer.
 * With remote hosts in the picture two servers can both run a container called
 * `nginx`, so the host has to be part of a shortcut's identity - otherwise a
 * shortcut for one server's nginx matches the other server's, and dismissing a
 * container on one server dismisses it everywhere.
 *
 * Row 1 is the local daemon and every existing shortcut belongs to it, which is
 * exactly what the dashboard showed before this migration ran.
 */
function addHostsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hosts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'agent',
      url TEXT,
      api_key TEXT,
      hostname TEXT,
      color TEXT,
      position INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const localHost = db.prepare("SELECT id FROM hosts WHERE id = 1").get();
  if (!localHost) {
    db.prepare(
      `INSERT INTO hosts (id, name, type, position, enabled)
       VALUES (1, ?, 'local', 0, 1)`,
    ).run(process.env.HOST_NAME || hostname() || "Local");
    console.log("[MIGRATION] Seeded the local host");
  }

  // No REFERENCES clause: SQLite refuses ADD COLUMN with a foreign key unless
  // the default is NULL, and foreign keys are on. Databases created from
  // scratch get the constraint from initializeSchema; deleting a host clears
  // its shortcuts explicitly either way.
  addColumnIfMissing("shortcuts", "host_id", "INTEGER NOT NULL DEFAULT 1");
  db.exec("UPDATE shortcuts SET host_id = 1 WHERE host_id IS NULL");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_shortcuts_host ON shortcuts(host_id)",
  );

  // dismissed_containers keyed the container name alone, so it has to be
  // rebuilt around (host, name). SQLite cannot change a primary key in place.
  if (!columnExists("dismissed_containers", "host_id")) {
    db.exec(`
      CREATE TABLE dismissed_containers_new (
        host_id INTEGER NOT NULL DEFAULT 1,
        container_match_name TEXT NOT NULL,
        display_name TEXT,
        dismissed_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (host_id, container_match_name)
      )
    `);
    db.exec(`
      INSERT INTO dismissed_containers_new
        (host_id, container_match_name, display_name, dismissed_at)
      SELECT 1, container_match_name, display_name, dismissed_at
      FROM dismissed_containers
    `);
    db.exec("DROP TABLE dismissed_containers");
    db.exec(
      "ALTER TABLE dismissed_containers_new RENAME TO dismissed_containers",
    );
    console.log("[MIGRATION] Rebuilt dismissed_containers with host_id");
  }
}

/**
 * Migration 012: Merge shortcuts that describe the same app
 *
 * 004 already deduplicated by container_name, which misses the duplicates this
 * codebase actually produced: rows that share a display name but were linked by
 * different identifiers - an image name on one and a container name on the
 * other ("logflare" vs "supabase-occams-analytics"), a hand-made shortcut with
 * no container link next to an auto-synced one ("coolify"), or two identical
 * rows written by two auto-sync requests racing each other.
 *
 * The surviving row is the one whose container link agrees with what is
 * displayed; anything the others carry and it lacks is copied over first, so
 * merging cannot lose a custom icon, port, URL or favourite.
 */
function mergeDuplicateShortcuts(): void {
  const rows = db
    .prepare(
      `SELECT id, display_name, description, icon, port, url, container_name,
              container_match_name, compose_project, section_id, position,
              is_favorite, use_tailscale
       FROM shortcuts ORDER BY id ASC`,
    )
    .all() as Array<{
    id: number;
    display_name: string;
    description: string | null;
    icon: string | null;
    port: number | null;
    url: string | null;
    container_name: string | null;
    container_match_name: string | null;
    compose_project: string | null;
    section_id: number | null;
    position: number;
    is_favorite: number;
    use_tailscale: number | null;
  }>;

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = (row.display_name || "").trim().toLowerCase();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const updateStmt = db.prepare(
    `UPDATE shortcuts
     SET description = ?, icon = ?, port = ?, url = ?, compose_project = ?,
         section_id = ?, position = ?, is_favorite = ?, use_tailscale = ?
     WHERE id = ?`,
  );
  const deleteStmt = db.prepare("DELETE FROM shortcuts WHERE id = ?");

  let mergedGroups = 0;
  let deleted = 0;

  const merge = db.transaction(() => {
    for (const [name, group] of groups) {
      if (group.length < 2) continue;
      // Only touch groups that auto-sync could have produced.
      if (!group.some((r) => r.container_name)) continue;

      const baseName = getContainerBaseName(name);
      const ranked = [...group].sort((a, b) => {
        const aAgrees = a.container_match_name === baseName ? 1 : 0;
        const bAgrees = b.container_match_name === baseName ? 1 : 0;
        if (aAgrees !== bAgrees) return bAgrees - aAgrees;
        const aLinked = a.container_name ? 1 : 0;
        const bLinked = b.container_name ? 1 : 0;
        if (aLinked !== bLinked) return bLinked - aLinked;
        if (a.is_favorite !== b.is_favorite) return b.is_favorite - a.is_favorite;
        return a.id - b.id;
      });

      const [winner, ...losers] = ranked;
      const hasIcon = (icon: string | null): boolean =>
        !!icon && icon !== "Server";

      const merged = { ...winner };
      for (const loser of losers) {
        if (!merged.description?.trim() && loser.description?.trim()) {
          merged.description = loser.description;
        }
        if (!hasIcon(merged.icon) && hasIcon(loser.icon)) {
          merged.icon = loser.icon;
        }
        if (merged.port === null && loser.port !== null) {
          merged.port = loser.port;
        }
        if (merged.url === null && loser.url !== null) {
          merged.url = loser.url;
        }
        if (merged.compose_project === null && loser.compose_project !== null) {
          merged.compose_project = loser.compose_project;
        }
        if (merged.section_id === null && loser.section_id !== null) {
          merged.section_id = loser.section_id;
        }
        // Keep the earliest slot on the dashboard so nothing appears to move.
        merged.position = Math.min(merged.position, loser.position);
        merged.is_favorite = merged.is_favorite || loser.is_favorite ? 1 : 0;
        merged.use_tailscale =
          merged.use_tailscale || loser.use_tailscale ? 1 : 0;
      }

      updateStmt.run(
        merged.description,
        merged.icon,
        merged.port,
        merged.url,
        merged.compose_project,
        merged.section_id,
        merged.position,
        merged.is_favorite,
        merged.use_tailscale,
        merged.id,
      );

      for (const loser of losers) {
        deleteStmt.run(loser.id);
        deleted++;
      }
      mergedGroups++;
      console.log(
        `[MIGRATION] Merged ${group.length} shortcuts named "${name}" into #${merged.id}`,
      );
    }
  });

  merge();

  console.log(
    `[MIGRATION] Merged ${mergedGroups} duplicate group(s), removed ${deleted} shortcut(s)`,
  );
}
