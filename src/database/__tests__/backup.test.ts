/**
 * The pre-migration backup is the only route back from an upgrade: several
 * migrations rebuild tables and 004 deletes rows, and none of them have a down
 * step. These check the copy is real and readable, not just that a file appeared.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dockerdash-backup-test-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");

const { db, initializeSchema } = await import("../../config/database.js");
const { createBackup } = await import("../backup.js");

beforeAll(() => {
  initializeSchema();
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function backups() {
  return fs.readdirSync(tmpDir).filter((f) => f.startsWith("dashboard.db.backup-"));
}

describe("createBackup", () => {
  it("writes a copy that still contains the rows", async () => {
    db.exec("DELETE FROM shortcuts");
    db.prepare(
      "INSERT INTO shortcuts (display_name, port) VALUES ('Jellyfin', 8096)",
    ).run();

    const dest = await createBackup("premigration");
    expect(dest).toBeTruthy();
    expect(fs.existsSync(dest as string)).toBe(true);

    // Open the backup independently: a file that exists but cannot be read as a
    // database would be worse than no backup at all.
    const copy = new Database(dest as string, { readonly: true });
    const row = copy
      .prepare("SELECT display_name, port FROM shortcuts")
      .get() as { display_name: string; port: number };
    copy.close();

    expect(row).toEqual({ display_name: "Jellyfin", port: 8096 });
  });

  it("does not capture rows written after the backup", async () => {
    const dest = await createBackup("premigration");
    db.prepare("INSERT INTO shortcuts (display_name) VALUES ('Added later')").run();

    const copy = new Database(dest as string, { readonly: true });
    const found = copy
      .prepare(
        "SELECT COUNT(*) AS n FROM shortcuts WHERE display_name = 'Added later'",
      )
      .get() as { n: number };
    copy.close();

    expect(found.n).toBe(0);
  });

  it("keeps only the most recent backups", async () => {
    for (let i = 0; i < 8; i += 1) {
      await createBackup("premigration");
      // Timestamps have millisecond resolution; make sure names differ.
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(backups().length).toBeLessThanOrEqual(5);
  });
});
