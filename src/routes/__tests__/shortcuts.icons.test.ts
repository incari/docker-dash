/**
 * Icons the user chose must survive.
 *
 * Two paths used to overwrite them silently: the bulk icon migration, which
 * preselected every shortcut whose icon merely differed from the Homarr
 * suggestion, and PUT /api/shortcuts/:id, which regenerated an icon from the
 * matching container whenever the request omitted the field.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dockerdash-icons-test-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");

const listContainers = vi.fn(async () => []);

vi.mock("../../config/docker.js", () => ({
  docker: { listContainers: (...a: unknown[]) => listContainers(...(a as [])) },
}));
vi.mock("../../utils/dockerIconVault.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // Network lookups would make these tests flaky.
    getValidatedIconUrl: vi.fn(async () => "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/generated.png"),
    urlExists: vi.fn(async () => true),
  };
});

const { db, initializeSchema } = await import("../../config/database.js");
const { default: shortcutsRouter } = await import("../shortcuts.js");
const express = (await import("express")).default;

const UPLOADED = "uploads/1768250448862-783202581.png";
const HOMARR = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/plex.png";
const CUSTOM = "https://play-lh.googleusercontent.com/custom.png";

let baseUrl: string;
let server: ReturnType<ReturnType<typeof express>["listen"]>;

beforeAll(async () => {
  initializeSchema();
  const app = express();
  app.use(express.json());
  app.use(shortcutsRouter);
  await new Promise<void>((r) => {
    server = app.listen(0, () => r());
  });
  const a = server.address();
  baseUrl = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
});

afterAll(() => {
  server?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec("DELETE FROM shortcuts");
  listContainers.mockResolvedValue([]);
});

function insert(icon: string, containerName: string | null = "plex"): number {
  const r = db
    .prepare(
      `INSERT INTO shortcuts (display_name, icon, container_name, container_match_name)
       VALUES ('Plex', @icon, @c, @c)`,
    )
    .run({ icon, c: containerName });
  return Number(r.lastInsertRowid);
}

function iconOf(id: number): string {
  return (db.prepare("SELECT icon FROM shortcuts WHERE id = ?").get(id) as { icon: string }).icon;
}

describe("bulk icon migration", () => {
  it("refuses to replace an uploaded icon even when asked to", async () => {
    const id = insert(UPLOADED);

    const res = await fetch(`${baseUrl}/api/shortcuts/migrate-icons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates: [{ id, icon_url: HOMARR }] }),
    });

    expect(res.status).toBe(200);
    expect(iconOf(id)).toBe(UPLOADED);
  });

  it("refuses to replace a custom URL the user set", async () => {
    const id = insert(CUSTOM);
    await fetch(`${baseUrl}/api/shortcuts/migrate-icons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates: [{ id, icon_url: HOMARR }] }),
    });
    expect(iconOf(id)).toBe(CUSTOM);
  });

  it("still migrates a default icon, which is the point of the feature", async () => {
    const id = insert("Server");
    await fetch(`${baseUrl}/api/shortcuts/migrate-icons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates: [{ id, icon_url: HOMARR }] }),
    });
    expect(iconOf(id)).toBe(HOMARR);
  });
});

describe("check-migration", () => {
  it("does not count icons the user chose", async () => {
    insert(UPLOADED);
    insert(CUSTOM);

    const body = await (await fetch(`${baseUrl}/api/shortcuts/check-migration`)).json();

    // Counting these made the modal open by itself and offer to replace them.
    expect(body.count).toBe(0);
    expect(body.needsMigration).toBe(false);
  });

  it("still counts a default icon", async () => {
    insert("Server");
    const body = await (await fetch(`${baseUrl}/api/shortcuts/check-migration`)).json();
    expect(body.count).toBe(1);
  });
});

describe("PUT /api/shortcuts/:id", () => {
  it("keeps an uploaded icon when the request omits one", async () => {
    const id = insert(UPLOADED);
    listContainers.mockResolvedValue([
      { Id: "x", Names: ["/plex"], Image: "plex", Ports: [] },
    ] as never);

    const res = await fetch(`${baseUrl}/api/shortcuts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "Plex", port: 32400 }),
    });

    expect(res.status).toBe(200);
    expect(iconOf(id)).toBe(UPLOADED);
  });

  it("still fills in an icon for a shortcut that has only the default", async () => {
    const id = insert("Server");
    listContainers.mockResolvedValue([
      { Id: "x", Names: ["/plex"], Image: "plex", Ports: [] },
    ] as never);

    await fetch(`${baseUrl}/api/shortcuts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "Plex" }),
    });

    expect(iconOf(id)).toContain("homarr-labs");
  });

  it("applies an icon the user explicitly sends", async () => {
    const id = insert(UPLOADED);
    await fetch(`${baseUrl}/api/shortcuts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "Plex", icon: CUSTOM }),
    });
    expect(iconOf(id)).toBe(CUSTOM);
  });
});
