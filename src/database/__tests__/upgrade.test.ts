/**
 * Upgrading a database that predates multi-host.
 *
 * Every other test starts from an empty file, which is the one case real users
 * never have. This one builds the schema as it shipped before servers existed,
 * fills it with the kind of rows people actually accumulated, and runs the
 * upgrade the way the server does at boot: initializeSchema, then runMigrations.
 *
 * What it is guarding is simple to state and easy to get wrong: after the
 * upgrade the dashboard must look exactly as it did before, with everything
 * filed under the local server.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dockerdash-upgrade-test-"));
const dbFile = path.join(tmpDir, "dashboard.db");
process.env.DB_PATH = dbFile;
process.env.HOST_NAME = "Unraid";

vi.mock("../../config/docker.js", () => ({
  docker: { listContainers: async () => [] },
}));

/**
 * The schema as it was before servers existed: no hosts table, no host_id, and
 * dismissed_containers keyed by the container name alone.
 */
function buildLegacyDatabase(): void {
  const legacy = new Database(dbFile);
  legacy.pragma("foreign_keys = ON");
  legacy.exec(`
    CREATE TABLE sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      is_collapsed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
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
    );
    CREATE TABLE dismissed_containers (
      container_match_name TEXT PRIMARY KEY,
      display_name TEXT,
      dismissed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      theme_primary TEXT DEFAULT '#3b82f6',
      theme_background TEXT DEFAULT '#0f172a',
      view_mode TEXT DEFAULT 'default',
      mobile_columns INTEGER DEFAULT 2,
      migration_dismissed INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const media = legacy
    .prepare("INSERT INTO sections (name, position) VALUES ('Media', 0)")
    .run();

  legacy
    .prepare(
      `INSERT INTO shortcuts
         (display_name, description, icon, port, container_name,
          container_match_name, section_id, position, is_favorite, use_tailscale)
       VALUES
         ('Jellyfin', 'Media server', 'https://icons/jellyfin.png', 8096,
          'jellyfin', 'jellyfin', ?, 0, 1, 1)`,
    )
    .run(Number(media.lastInsertRowid));

  legacy
    .prepare(
      `INSERT INTO shortcuts (display_name, url, position)
       VALUES ('Docs', 'https://example.com', 1)`,
    )
    .run();

  legacy
    .prepare(
      `INSERT INTO dismissed_containers (container_match_name, display_name)
       VALUES ('watchtower', 'Watchtower')`,
    )
    .run();

  legacy
    .prepare("INSERT INTO settings (id, theme_primary) VALUES (1, '#ff0000')")
    .run();

  legacy.close();
}

buildLegacyDatabase();

const { db, initializeSchema } = await import("../../config/database.js");
const { runMigrations } = await import("../migrations.js");

beforeAll(async () => {
  // Exactly what server.ts does at boot.
  initializeSchema();
  await runMigrations();
});

afterAll(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("upgrading from a database without servers", () => {
  it("keeps every shortcut, with its section, icon and favourite flag", () => {
    const rows = db
      .prepare(
        `SELECT s.display_name, s.icon, s.port, s.is_favorite, s.use_tailscale,
                sec.name AS section
         FROM shortcuts s LEFT JOIN sections sec ON sec.id = s.section_id
         ORDER BY s.position`,
      )
      .all();

    expect(rows).toEqual([
      {
        display_name: "Jellyfin",
        icon: "https://icons/jellyfin.png",
        port: 8096,
        is_favorite: 1,
        use_tailscale: 1,
        section: "Media",
      },
      {
        display_name: "Docs",
        icon: "Server",
        port: null,
        is_favorite: 0,
        use_tailscale: 0,
        section: null,
      },
    ]);
  });

  it("files everything under the local server", () => {
    const hosts = db.prepare("SELECT id, name, type FROM hosts").all();
    expect(hosts).toEqual([{ id: 1, name: "Unraid", type: "local" }]);

    expect(db.prepare("SELECT DISTINCT host_id FROM shortcuts").all()).toEqual([
      { host_id: 1 },
    ]);
  });

  it("carries deletions across, rekeyed by server", () => {
    expect(
      db
        .prepare(
          "SELECT host_id, container_match_name, display_name FROM dismissed_containers",
        )
        .all(),
    ).toEqual([
      { host_id: 1, container_match_name: "watchtower", display_name: "Watchtower" },
    ]);
  });

  it("keeps the user's settings and adds the new columns", () => {
    const settings = db
      .prepare("SELECT theme_primary, api_key, agent_enabled FROM settings WHERE id = 1")
      .get() as {
      theme_primary: string;
      api_key: string | null;
      agent_enabled: number;
    };

    expect(settings.theme_primary).toBe("#ff0000");
    // Not yet generated: that happens at boot, after the migrations.
    expect(settings.agent_enabled).toBe(0);
  });

  it("leaves a backup of the database as it was before the upgrade", () => {
    const backups = fs
      .readdirSync(tmpDir)
      .filter((name) => name.startsWith("dashboard.db.backup-"));

    expect(backups.length).toBeGreaterThan(0);

    // The copy really is the old shape - the point of keeping it.
    const before = new Database(path.join(tmpDir, backups[0] as string), {
      readonly: true,
    });
    const columns = (
      before.pragma("table_info(shortcuts)") as Array<{ name: string }>
    ).map((c) => c.name);
    before.close();

    expect(columns).not.toContain("host_id");
  });

  it("does not run the migrations again on the next boot", async () => {
    const before = db
      .prepare("SELECT COUNT(*) AS n FROM migrations")
      .get() as { n: number };

    await runMigrations();

    const after = db
      .prepare("SELECT COUNT(*) AS n FROM migrations")
      .get() as { n: number };
    expect(after.n).toBe(before.n);
  });
});
