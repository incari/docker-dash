/**
 * Upgrading a 0.3.0 database, whose remote servers were other dashboards.
 *
 * Those rows cannot be pointed at their daemon automatically - the address is
 * a different port or a different protocol altogether - so the upgrade has to
 * keep them and everything filed under them, switch them off, and forget the
 * keys nothing will read again.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dockerdash-retire-test-"));
process.env.DB_PATH = path.join(tmpDir, "dashboard.db");

vi.mock("../../config/docker.js", () => ({
  docker: { listContainers: async () => [] },
}));

const { db, initializeSchema } = await import("../../config/database.js");
const { runMigrations } = await import("../migrations.js");

const columns = (table: string) =>
  (db.pragma(`table_info(${table})`) as Array<{ name: string }>).map(
    (c) => c.name,
  );

beforeAll(async () => {
  initializeSchema();
  await runMigrations();

  // Back to how 0.3.0 left it: the key columns, an agent row with a key and a
  // shortcut, and 015 not yet run.
  db.exec("ALTER TABLE hosts ADD COLUMN api_key TEXT");
  db.exec("ALTER TABLE settings ADD COLUMN api_key TEXT");
  db.exec("ALTER TABLE settings ADD COLUMN agent_enabled INTEGER DEFAULT 0");
  db.exec("INSERT OR IGNORE INTO settings (id) VALUES (1)");
  db.exec("UPDATE settings SET api_key = 'this-machines-key', agent_enabled = 1");
  const nas = db
    .prepare(
      `INSERT INTO hosts (name, type, url, api_key, color, position, enabled)
       VALUES ('NAS', 'agent', 'http://nas.local:3080', 'super-secret', '#22c55e', 1, 1)`,
    )
    .run();
  db.prepare(
    "INSERT INTO shortcuts (host_id, display_name, port) VALUES (?, 'Immich', 2283)",
  ).run(Number(nas.lastInsertRowid));
  db.prepare("DELETE FROM migrations WHERE name = '015_retire_agents'").run();

  await runMigrations();
});

afterAll(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("migration 015", () => {
  it("keeps the old servers and their shortcuts, switched off", () => {
    expect(
      db
        .prepare(
          `SELECT h.name, h.type, h.url, h.color, h.enabled, s.display_name
           FROM hosts h JOIN shortcuts s ON s.host_id = h.id
           WHERE h.id != 1`,
        )
        .all(),
    ).toEqual([
      {
        name: "NAS",
        type: "docker",
        url: "http://nas.local:3080",
        color: "#22c55e",
        enabled: 0,
        display_name: "Immich",
      },
    ]);
  });

  it("drops every key the agent kept", () => {
    expect(columns("hosts")).not.toContain("api_key");
    expect(columns("settings")).not.toContain("api_key");
    expect(columns("settings")).not.toContain("agent_enabled");
  });

  it("leaves the local server alone", () => {
    expect(
      db.prepare("SELECT type, enabled FROM hosts WHERE id = 1").get(),
    ).toEqual({ type: "local", enabled: 1 });
  });
});
