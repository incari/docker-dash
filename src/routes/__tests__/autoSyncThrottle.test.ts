/**
 * Not sweeping the whole fleet once per browser tab.
 *
 * Auto-sync runs on every dashboard load. With one Docker socket that was
 * cheap; across servers it contacts each one, deliberately bypassing the
 * container cache, and looks up an icon over the network for every new
 * container. Five tabs opening meant five full sweeps, queued behind each
 * other. A recent result now stands in - except when something changed that a
 * sweep has to see.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dockerdash-throttle-test-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");
process.env.AUTO_SYNC_INTERVAL_MS = "60000";
process.env.HOST_CACHE_MS = "0";

const listContainers = vi.fn(async () => [] as unknown[]);

vi.mock("../../config/docker.js", () => ({
  docker: { listContainers: (...a: unknown[]) => listContainers(...(a as [])) },
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
const { default: hostsRouter } = await import("../hosts.js");
const { invalidateContainerCache } = await import("../../hosts/client.js");
const { invalidateAutoSync } = await import("../../hosts/syncState.js");
const express = (await import("express")).default;

function container(id: string, name: string) {
  return {
    Id: id,
    Names: [`/${name}`],
    Image: "nginx:latest",
    State: "running",
    Status: "Up 2 hours",
    Labels: {},
    Ports: [],
  };
}

let baseUrl: string;
let server: ReturnType<ReturnType<typeof express>["listen"]>;

beforeAll(async () => {
  initializeSchema();

  const app = express();
  app.use(express.json());
  app.use(hostsRouter);
  app.use(shortcutsRouter);

  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec("DELETE FROM shortcuts; DELETE FROM dismissed_containers;");
  db.prepare("DELETE FROM hosts WHERE id != 1").run();
  invalidateContainerCache();
  invalidateAutoSync();
  listContainers.mockResolvedValue([container("a", "nginx")]);
});

async function sync(): Promise<{ created: number; reused?: boolean }> {
  return (await (
    await fetch(`${baseUrl}/api/shortcuts/auto-sync`, { method: "POST" })
  ).json()) as { created: number; reused?: boolean };
}

function shortcutNames(): string[] {
  return (
    db.prepare("SELECT display_name FROM shortcuts ORDER BY id").all() as Array<{
      display_name: string;
    }>
  ).map((row) => row.display_name);
}

describe("how often auto-sync really runs", () => {
  it("reuses a recent sweep instead of reading every server again", async () => {
    const first = await sync();
    expect(first.created).toBe(1);
    expect(first.reused).toBeUndefined();

    // A second tab opens. The container list has changed, but the point is that
    // this must not go and look - the answer from a moment ago will do.
    listContainers.mockResolvedValue([
      container("a", "nginx"),
      container("b", "plex"),
    ]);

    const second = await sync();
    expect(second.reused).toBe(true);
    expect(shortcutNames()).toEqual(["nginx"]);
  });

  it("sweeps for real once a server is added", async () => {
    await sync();

    listContainers.mockResolvedValue([
      container("a", "nginx"),
      container("b", "plex"),
    ]);

    // Adding a server is exactly the case a stale answer would get wrong: its
    // containers have no shortcuts at all yet.
    const created = await fetch(`${baseUrl}/api/hosts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "NAS",
        url: "http://127.0.0.1:49517",
        api_key: "k",
      }),
    });
    expect(created.status).toBe(200);
    invalidateContainerCache();

    const after = await sync();
    expect(after.reused).toBeUndefined();
    expect(shortcutNames()).toEqual(["nginx", "plex"]);
  });

  it("sweeps for real once a server is removed", async () => {
    const created = (await (
      await fetch(`${baseUrl}/api/hosts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "NAS",
          url: "http://127.0.0.1:49517",
          api_key: "k",
        }),
      })
    ).json()) as { id: number };

    invalidateAutoSync();
    await sync();

    listContainers.mockResolvedValue([
      container("a", "nginx"),
      container("b", "plex"),
    ]);

    await fetch(`${baseUrl}/api/hosts/${created.id}`, { method: "DELETE" });
    invalidateContainerCache();

    expect((await sync()).reused).toBeUndefined();
  });
});
