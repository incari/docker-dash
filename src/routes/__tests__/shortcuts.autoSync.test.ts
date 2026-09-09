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
