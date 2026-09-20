/**
 * Covers POST /api/shortcuts/auto-sync against a real SQLite database.
 *
 * This exists because the endpoint shipped broken: the INSERT declared seven
 * columns and was called with six values, so better-sqlite3 threw
 * "Too few parameter values were provided" on the first container and no
 * shortcut was ever created automatically. A parameter mismatch has to fail
 * here rather than in production.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dockerdash-test-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");
// These exercise what a sweep does, not how often it is allowed to run, so the
// throttle is off here. autoSyncThrottle.test.ts covers the throttle itself.
process.env.AUTO_SYNC_INTERVAL_MS = "0";

const listContainers = vi.fn();

// Docker is not available in tests, and the icon lookup would hit the network.
vi.mock("../../config/docker.js", () => ({
  docker: { listContainers: (...args: unknown[]) => listContainers(...args) },
}));
vi.mock("../../utils/dockerIconVault.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getValidatedIconUrl: vi.fn(async () => "Server"),
    urlExists: vi.fn(async () => false),
  };
});

const { db, initializeSchema } = await import("../../config/database.js");
const { default: shortcutsRouter } = await import("../shortcuts.js");
const express = (await import("express")).default;

let baseUrl: string;
let server: ReturnType<ReturnType<typeof express>["listen"]>;

beforeAll(async () => {
  initializeSchema();

  const app = express();
  app.use(express.json());
  app.use(shortcutsRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec("DELETE FROM shortcuts");
  db.exec("DELETE FROM dismissed_containers");
  listContainers.mockReset();
});

function dockerContainer(name: string, publicPort: number | null) {
  return {
    Id: `id-${name}`,
    Names: [`/${name}`],
    Image: `linuxserver/${name}:latest`,
    Ports: publicPort ? [{ PublicPort: publicPort, PrivatePort: 80 }] : [],
  };
}

/** A container whose port list is given verbatim, the way Docker reports it. */
function dockerContainerWithPorts(
  name: string,
  ports: Array<{ PrivatePort: number; PublicPort?: number; Type?: string }>,
) {
  return {
    Id: `id-${name}`,
    Names: [`/${name}`],
    Image: `linuxserver/${name}:latest`,
    Ports: ports,
  };
}

async function autoSync() {
  const res = await fetch(`${baseUrl}/api/shortcuts/auto-sync`, {
    method: "POST",
  });
  return { res, body: await res.json() };
}

describe("POST /api/shortcuts/auto-sync", () => {
  it("creates a shortcut for a container that has none", async () => {
    listContainers.mockResolvedValue([dockerContainer("jellyfin", 8096)]);

    const res = await fetch(`${baseUrl}/api/shortcuts/auto-sync`, {
      method: "POST",
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, created: 1 });

    const rows = db
      .prepare(
        "SELECT display_name, container_name, container_match_name, description, icon, port, is_favorite FROM shortcuts",
      )
      .all();

    // Every column must land in its own field: the original bug shifted them.
    expect(rows).toEqual([
      {
        display_name: "jellyfin",
        container_name: "jellyfin",
        container_match_name: "jellyfin",
        description: null,
        icon: "Server",
        port: 8096,
        is_favorite: 0,
      },
    ]);
  });

  it("handles a container with no published port", async () => {
    listContainers.mockResolvedValue([dockerContainer("postgres", null)]);

    const res = await fetch(`${baseUrl}/api/shortcuts/auto-sync`, {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const row = db
      .prepare("SELECT display_name, port FROM shortcuts")
      .get() as { display_name: string; port: number | null };
    expect(row).toEqual({ display_name: "postgres", port: null });
  });

  it("does not duplicate a shortcut that already exists", async () => {
    listContainers.mockResolvedValue([dockerContainer("sonarr", 8989)]);

    await fetch(`${baseUrl}/api/shortcuts/auto-sync`, { method: "POST" });
    const second = await fetch(`${baseUrl}/api/shortcuts/auto-sync`, {
      method: "POST",
    });
    const body = await second.json();

    expect(body).toMatchObject({ created: 0 });
    const count = db
      .prepare("SELECT COUNT(*) AS n FROM shortcuts")
      .get() as { n: number };
    expect(count.n).toBe(1);
  });
});

describe("auto-sync and deleted shortcuts", () => {
  it("does not recreate a shortcut the user deleted", async () => {
    listContainers.mockResolvedValue([dockerContainer("plex", 32400)]);

    await autoSync();
    const created = db.prepare("SELECT id FROM shortcuts").get() as {
      id: number;
    };

    const deleted = await fetch(`${baseUrl}/api/shortcuts/${created.id}`, {
      method: "DELETE",
    });
    expect(deleted.status).toBe(200);

    const { body } = await autoSync();

    expect(body).toMatchObject({ created: 0, skipped: 1 });
    const count = db.prepare("SELECT COUNT(*) AS n FROM shortcuts").get() as {
      n: number;
    };
    expect(count.n).toBe(0);
  });

  it("remembers the deletion by match name, so a renamed container stays gone", async () => {
    // Compose scale suffixes and recreations change the container's name; the
    // dismissal is keyed by the stable base name, so it still applies.
    listContainers.mockResolvedValue([dockerContainer("radarr-1", 7878)]);
    await autoSync();
    const created = db.prepare("SELECT id FROM shortcuts").get() as {
      id: number;
    };
    await fetch(`${baseUrl}/api/shortcuts/${created.id}`, { method: "DELETE" });

    listContainers.mockResolvedValue([dockerContainer("radarr-2", 7878)]);
    const { body } = await autoSync();

    expect(body).toMatchObject({ created: 0 });
    const count = db.prepare("SELECT COUNT(*) AS n FROM shortcuts").get() as {
      n: number;
    };
    expect(count.n).toBe(0);
  });

  it("still creates shortcuts for genuinely new containers", async () => {
    listContainers.mockResolvedValue([dockerContainer("lidarr", 8686)]);
    await autoSync();
    const created = db.prepare("SELECT id FROM shortcuts").get() as {
      id: number;
    };
    await fetch(`${baseUrl}/api/shortcuts/${created.id}`, { method: "DELETE" });

    listContainers.mockResolvedValue([
      dockerContainer("lidarr", 8686),
      dockerContainer("bazarr", 6767),
    ]);
    const { body } = await autoSync();

    expect(body).toMatchObject({ created: 1 });
    const names = db
      .prepare("SELECT display_name FROM shortcuts")
      .all() as Array<{ display_name: string }>;
    expect(names.map((n) => n.display_name)).toEqual(["bazarr"]);
  });

  it("lets the user add a dismissed container back by hand", async () => {
    listContainers.mockResolvedValue([dockerContainer("prowlarr", 9696)]);
    await autoSync();
    const created = db.prepare("SELECT id FROM shortcuts").get() as {
      id: number;
    };
    await fetch(`${baseUrl}/api/shortcuts/${created.id}`, { method: "DELETE" });

    const readded = await fetch(`${baseUrl}/api/shortcuts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: "prowlarr",
        container_name: "prowlarr",
        port: "9696",
        icon: "Server",
      }),
    });
    expect(readded.status).toBe(200);

    const dismissed = db
      .prepare("SELECT COUNT(*) AS n FROM dismissed_containers")
      .get() as { n: number };
    expect(dismissed.n).toBe(0);
  });

  it("does not dismiss a shortcut that was never linked to a container", async () => {
    const created = await fetch(`${baseUrl}/api/shortcuts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: "My Router",
        url: "http://192.168.1.1",
        icon: "Server",
      }),
    });
    const { id } = (await created.json()) as { id: number };
    await fetch(`${baseUrl}/api/shortcuts/${id}`, { method: "DELETE" });

    const dismissed = db
      .prepare("SELECT COUNT(*) AS n FROM dismissed_containers")
      .get() as { n: number };
    expect(dismissed.n).toBe(0);
  });
});

describe("auto-sync duplicate prevention", () => {
  it("skips a container that a hand-made shortcut already covers", async () => {
    // The live server grew two "coolify" tiles this way: a shortcut added by
    // hand has no container_name, so auto-sync used not to see it at all.
    db.prepare(
      "INSERT INTO shortcuts (display_name, port, icon) VALUES ('Jellyfin', 8096, 'Server')",
    ).run();
    listContainers.mockResolvedValue([dockerContainer("jellyfin", 8096)]);

    const { body } = await autoSync();

    expect(body).toMatchObject({ created: 0 });
    const count = db.prepare("SELECT COUNT(*) AS n FROM shortcuts").get() as {
      n: number;
    };
    expect(count.n).toBe(1);
  });

  it("creates one shortcut when two syncs run at the same time", async () => {
    listContainers.mockResolvedValue([dockerContainer("uptime-kuma", 3001)]);

    await Promise.all([autoSync(), autoSync(), autoSync()]);

    const count = db.prepare("SELECT COUNT(*) AS n FROM shortcuts").get() as {
      n: number;
    };
    expect(count.n).toBe(1);
  });
});

describe("auto-sync port selection", () => {
  it("ignores an exposed-but-unpublished port listed first", async () => {
    // Exactly what coolify reports: 7000/tcp exposed with no host binding,
    // then the UI published on host 7000 from private 8080.
    listContainers.mockResolvedValue([
      dockerContainerWithPorts("coolify", [
        { PrivatePort: 7000, Type: "tcp" },
        { PrivatePort: 8080, PublicPort: 7000, Type: "tcp" },
        { PrivatePort: 8443, Type: "tcp" },
        { PrivatePort: 9000, Type: "tcp" },
      ]),
    ]);

    await autoSync();

    const row = db.prepare("SELECT port FROM shortcuts").get() as {
      port: number | null;
    };
    expect(row.port).toBe(7000);
  });

  it("prefers the web UI port over a peer port listed first", async () => {
    // transmission lists the BitTorrent port 51413 (tcp and udp) before 9091.
    listContainers.mockResolvedValue([
      dockerContainerWithPorts("transmission", [
        { PrivatePort: 51413, PublicPort: 51413, Type: "tcp" },
        { PrivatePort: 51413, PublicPort: 51413, Type: "udp" },
        { PrivatePort: 9091, PublicPort: 9091, Type: "tcp" },
      ]),
    ]);

    await autoSync();

    const row = db.prepare("SELECT port FROM shortcuts").get() as {
      port: number | null;
    };
    expect(row.port).toBe(9091);
  });

  it("prefers a conventional HTTP port over a lower unrelated one", async () => {
    listContainers.mockResolvedValue([
      dockerContainerWithPorts("pihole", [
        { PrivatePort: 53, PublicPort: 53, Type: "tcp" },
        { PrivatePort: 53, PublicPort: 53, Type: "udp" },
        { PrivatePort: 80, PublicPort: 8053, Type: "tcp" },
      ]),
    ]);

    await autoSync();

    const row = db.prepare("SELECT port FROM shortcuts").get() as {
      port: number | null;
    };
    expect(row.port).toBe(8053);
  });

  it("fills in a port that an earlier sync failed to pick up", async () => {
    db.prepare(
      `INSERT INTO shortcuts (display_name, container_name, container_match_name, port, icon)
       VALUES ('sqlitebrowser', 'sqlitebrowser', 'sqlitebrowser', NULL, 'Server')`,
    ).run();
    listContainers.mockResolvedValue([
      dockerContainerWithPorts("sqlitebrowser", [
        { PrivatePort: 3000, PublicPort: 3300, Type: "tcp" },
        { PrivatePort: 3001, PublicPort: 3301, Type: "tcp" },
      ]),
    ]);

    const { body } = await autoSync();

    expect(body).toMatchObject({ created: 0, updated: 1 });
    const row = db.prepare("SELECT port FROM shortcuts").get() as {
      port: number | null;
    };
    expect(row.port).toBe(3300);
  });

  it("leaves a port the container still publishes alone", async () => {
    // 51413 is not the port auto-sync would choose, but the container does
    // publish it, so it may well have been picked in the editor on purpose.
    db.prepare(
      `INSERT INTO shortcuts (display_name, container_name, container_match_name, port, icon)
       VALUES ('transmission', 'transmission', 'transmission', 51413, 'Server')`,
    ).run();
    listContainers.mockResolvedValue([
      dockerContainerWithPorts("transmission", [
        { PrivatePort: 51413, PublicPort: 51413, Type: "tcp" },
        { PrivatePort: 9091, PublicPort: 9091, Type: "tcp" },
      ]),
    ]);

    const { body } = await autoSync();

    expect(body).toMatchObject({ updated: 0 });
    const row = db.prepare("SELECT port FROM shortcuts").get() as {
      port: number | null;
    };
    expect(row.port).toBe(51413);
  });

  it("does not clear a port when the container is stopped", async () => {
    db.prepare(
      `INSERT INTO shortcuts (display_name, container_name, container_match_name, port, icon)
       VALUES ('grafana', 'grafana', 'grafana', 3000, 'Server')`,
    ).run();
    listContainers.mockResolvedValue([dockerContainerWithPorts("grafana", [])]);

    await autoSync();

    const row = db.prepare("SELECT port FROM shortcuts").get() as {
      port: number | null;
    };
    expect(row.port).toBe(3000);
  });
});
