/**
 * Database migrations for Docker Dashboard
 */

import { db, columnExists, getTableInfo } from "../config/database.js";
import Docker from "dockerode";

const docker = new Docker({
  socketPath: process.env.DOCKER_SOCKET || "/var/run/docker.sock",
});

/**
 * Run all migrations
 */
export async function runMigrations(): Promise<void> {
  console.log("[MIGRATIONS] Starting database migrations...");

  // Basic column migrations
  addColumnIfMissing("shortcuts", "url", "TEXT");
  addColumnIfMissing("shortcuts", "container_id", "TEXT");
  addColumnIfMissing("shortcuts", "is_favorite", "INTEGER DEFAULT 0");
  addColumnIfMissing("shortcuts", "use_tailscale", "INTEGER DEFAULT 0");
  addColumnIfMissing("shortcuts", "section_id", "INTEGER");
  addColumnIfMissing("shortcuts", "icon_type", "TEXT");

  // Position migration
  migratePositionColumn();

  // Settings migration
  addColumnIfMissing("settings", "migration_dismissed", "INTEGER DEFAULT 0");

  // Display name migration
  migrateDisplayNameColumn();

  // Container name migration
  await migrateContainerNameColumn();

  // Duplicate cleanup
  cleanupDuplicates();

  // Container base name migration
  migrateContainerBaseName();

  // Remove name column (final step)
  removeNameColumn();

  // Port nullable migration
  migratePortNullable();

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
        const currentTableInfo = getTableInfo("shortcuts");
        const currentColumns = currentTableInfo
          .map((c) => c.name)
          .filter((c) => c !== "name");

        db.exec("ALTER TABLE shortcuts RENAME TO shortcuts_old");
        db.exec(`
          CREATE TABLE shortcuts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            display_name TEXT NOT NULL,
            description TEXT,
            icon TEXT DEFAULT 'cube',
            port INTEGER,
            url TEXT,
            container_id TEXT,
            container_name TEXT,
            is_favorite INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            position INTEGER DEFAULT 0,
            section_id INTEGER,
            icon_type TEXT,
            use_tailscale INTEGER DEFAULT 0,
            original_container_name TEXT
          )
        `);

        const columnsToInsert = currentColumns.join(", ");
        db.exec(
          `INSERT INTO shortcuts (${columnsToInsert}) SELECT ${columnsToInsert} FROM shortcuts_old`,
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
        db.exec("ALTER TABLE shortcuts RENAME TO shortcuts_old");
        db.exec(`
          CREATE TABLE shortcuts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            display_name TEXT NOT NULL,
            description TEXT,
            icon TEXT DEFAULT 'cube',
            port INTEGER,
            url TEXT,
            container_id TEXT,
            container_name TEXT,
            is_favorite INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            position INTEGER DEFAULT 0,
            section_id INTEGER,
            icon_type TEXT,
            use_tailscale INTEGER DEFAULT 0,
            original_container_name TEXT
          )
        `);

        const oldCols = getTableInfo("shortcuts_old").map((c) => c.name);
        const newCols = [
          "id",
          "display_name",
          "description",
          "icon",
          "port",
          "url",
          "container_id",
          "container_name",
          "is_favorite",
          "created_at",
          "updated_at",
          "position",
          "section_id",
          "icon_type",
          "use_tailscale",
          "original_container_name",
        ];
        const intersect = newCols.filter((c) => oldCols.includes(c));
        const colsStr = intersect.join(", ");

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
