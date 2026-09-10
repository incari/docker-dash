/**
 * Export/import round-trip.
 *
 * Import replaces everything and remaps section ids, which is the part most
 * likely to go quietly wrong: shortcuts reference sections by id, and the new
 * rows get different ones.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dockerdash-data-test-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");

const { db, initializeSchema } = await import("../../config/database.js");
const { default: dataRouter } = await import("../data.js");
const express = (await import("express")).default;

let baseUrl: string;
let server: ReturnType<ReturnType<typeof express>["listen"]>;

beforeAll(async () => {
  initializeSchema();
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(dataRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterAll(() => {
  server?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec("DELETE FROM shortcuts; DELETE FROM sections;");
});

function seed() {
  const media = db
    .prepare("INSERT INTO sections (name, position) VALUES ('Media', 0)")
    .run();
  db.prepare(
    `INSERT INTO shortcuts (display_name, description, port, section_id, is_favorite, position)
     VALUES (@n, @d, @p, @s, 1, 0)`,
  ).run({
    n: "Jellyfin",
    d: "Media server",
    p: 8096,
    s: Number(media.lastInsertRowid),
  });
  db.prepare(
    "INSERT INTO shortcuts (display_name, url, section_id, position) VALUES ('Docs', 'https://example.com', NULL, 1)",
  ).run();
}

describe("export / import", () => {
  it("exports shortcuts and sections", async () => {
    seed();
    const res = await fetch(`${baseUrl}/api/export`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(body.version).toBe(1);
    expect(body.sections).toHaveLength(1);
    expect(body.shortcuts).toHaveLength(2);
    expect(body.shortcuts[0]).toMatchObject({
      display_name: "Jellyfin",
      description: "Media server",
      port: 8096,
    });
  });

  it("round-trips, keeping shortcuts attached to their section", async () => {
    seed();
    const exported = await (await fetch(`${baseUrl}/api/export`)).json();

    // Wipe, then import into an empty database so section ids differ.
    db.exec("DELETE FROM shortcuts; DELETE FROM sections;");
    db.prepare("INSERT INTO sections (name, position) VALUES ('Filler', 0)").run();
    db.exec("DELETE FROM sections");

    const res = await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(exported),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, shortcuts: 2, sections: 1 });

    const rows = db
      .prepare(
        `SELECT s.display_name, sec.name AS section
         FROM shortcuts s LEFT JOIN sections sec ON sec.id = s.section_id
         ORDER BY s.position`,
      )
      .all();

    expect(rows).toEqual([
      { display_name: "Jellyfin", section: "Media" },
      { display_name: "Docs", section: null },
    ]);
  });

  it("replaces existing data rather than appending", async () => {
    seed();
    const exported = await (await fetch(`${baseUrl}/api/export`)).json();

    await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(exported),
    });

    const count = db.prepare("SELECT COUNT(*) AS n FROM shortcuts").get() as {
      n: number;
    };
    expect(count.n).toBe(2);
  });

  it("refuses an export from an unknown version", async () => {
    const res = await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 99, sections: [], shortcuts: [] }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Unsupported export version");
  });

  it("refuses a body that is not an export file", async () => {
    const res = await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1 }),
    });
    expect(res.status).toBe(400);
  });

  it("writes a backup before replacing anything", async () => {
    seed();
    const exported = await (await fetch(`${baseUrl}/api/export`)).json();
    const before = fs.readdirSync(tmpDir).filter((f) => f.includes("preimport"));

    await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(exported),
    });

    const after = fs.readdirSync(tmpDir).filter((f) => f.includes("preimport"));
    expect(after.length).toBeGreaterThan(before.length);
  });
});
