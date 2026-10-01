/**
 * Being read by a hub, without touching a terminal.
 *
 * With no API_KEY in the environment an installation generates its own key and
 * keeps it - but stays closed until someone switches reading on from its own
 * dashboard. This file has no API_KEY set, which is the whole point: the other
 * multi-host test covers the environment-pinned path.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dockerdash-access-test-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");
delete process.env.API_KEY;

vi.mock("../../config/docker.js", () => ({
  docker: {
    listContainers: async () => [],
    getContainer: () => ({ inspect: async () => ({}) }),
  },
}));

const { db, initializeSchema } = await import("../../config/database.js");
const { ensureApiKey } = await import("../../hosts/agentAccess.js");
const { ensureLocalHost } = await import("../../hosts/registry.js");
const { default: agentRouter } = await import("../agent.js");
const { default: containersRouter } = await import("../containers.js");
const { default: hostsRouter } = await import("../hosts.js");
const express = (await import("express")).default;

let baseUrl: string;
let server: ReturnType<ReturnType<typeof express>["listen"]>;

beforeAll(async () => {
  initializeSchema();
  ensureLocalHost();

  const app = express();
  app.use(express.json());
  app.use(agentRouter);
  app.use(hostsRouter);
  app.use(containersRouter);

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
  db.exec("DELETE FROM settings");
  ensureApiKey();
});

async function localHost(): Promise<{
  agent: { enabled: boolean; managed_by_env: boolean; api_key: string };
}> {
  const hosts = (await (await fetch(`${baseUrl}/api/hosts`)).json()) as Array<{
    id: number;
    agent: { enabled: boolean; managed_by_env: boolean };
  }>;
  const local = hosts.find((h) => h.id === 1)!;
  // The key is not in the listing - every tab polls that - but on its own
  // endpoint, fetched when someone asks to see it.
  const { api_key } = (await (
    await fetch(`${baseUrl}/api/hosts/1/api-key`)
  ).json()) as { api_key: string };
  return { agent: { ...local.agent, api_key } };
}

describe("this machine's own API key", () => {
  it("is generated at boot, so it can be copied rather than invented", async () => {
    const host = await localHost();

    expect(host.agent.api_key).toMatch(/^[0-9a-f]{64}$/);
    expect(host.agent.managed_by_env).toBe(false);
  });

  it("is not in the host listing, which every open tab polls", async () => {
    const raw = await (await fetch(`${baseUrl}/api/hosts`)).text();
    const { api_key } = (await localHost()).agent;

    expect(raw).not.toContain(api_key);
    expect(raw).toContain('"agent"');
  });

  it("does nothing until reading this server is switched on", async () => {
    const { agent } = await localHost();

    const closed = await fetch(`${baseUrl}/api/agent/containers`, {
      headers: { Authorization: `Bearer ${agent.api_key}` },
    });
    // 404 rather than 401: the right key on a server that is not offering
    // itself should say so, not imply the key was wrong.
    expect(closed.status).toBe(404);

    await fetch(`${baseUrl}/api/hosts/1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_enabled: true }),
    });

    const open = await fetch(`${baseUrl}/api/agent/containers`, {
      headers: { Authorization: `Bearer ${agent.api_key}` },
    });
    expect(open.status).toBe(200);
    expect((await localHost()).agent.enabled).toBe(true);
  });

  it("keeps what is known about reachability when only the setting changes", async () => {
    // Read the server once so there is a status to lose.
    await fetch(`${baseUrl}/api/containers`).catch(() => undefined);
    const before = (await (await fetch(`${baseUrl}/api/hosts`)).json()) as Array<{
      status: { online: boolean; checked_at: string | null };
    }>;

    await fetch(`${baseUrl}/api/hosts/1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_enabled: true }),
    });

    const after = (await (await fetch(`${baseUrl}/api/hosts`)).json()) as Array<{
      status: { online: boolean; checked_at: string | null };
    }>;
    expect(after[0].status.checked_at).toBe(before[0].status.checked_at);
  });

  it("still refuses the wrong key once switched on", async () => {
    await fetch(`${baseUrl}/api/hosts/1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_enabled: true }),
    });

    const response = await fetch(`${baseUrl}/api/agent/containers`, {
      headers: { Authorization: "Bearer not-the-key" },
    });
    expect(response.status).toBe(401);
  });

  it("can be replaced, which locks out whoever held the old one", async () => {
    await fetch(`${baseUrl}/api/hosts/1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_enabled: true }),
    });
    const oldKey = (await localHost()).agent.api_key;

    const rotated = await fetch(`${baseUrl}/api/hosts/1/api-key`, {
      method: "POST",
    });
    expect(rotated.status).toBe(200);

    const newKey = (await localHost()).agent.api_key;
    expect(newKey).not.toBe(oldKey);
    expect(newKey).toMatch(/^[0-9a-f]{64}$/);

    const withOldKey = await fetch(`${baseUrl}/api/agent/containers`, {
      headers: { Authorization: `Bearer ${oldKey}` },
    });
    expect(withOldKey.status).toBe(401);

    const withNewKey = await fetch(`${baseUrl}/api/agent/containers`, {
      headers: { Authorization: `Bearer ${newKey}` },
    });
    expect(withNewKey.status).toBe(200);
  });

  it("is only offered for this machine, never for a remote server", async () => {
    db.prepare(
      `INSERT INTO hosts (name, type, url, api_key, position, enabled)
       VALUES ('NAS', 'agent', 'http://nas.local:3080', 'their-key', 1, 1)`,
    ).run();

    const hosts = (await (await fetch(`${baseUrl}/api/hosts`)).json()) as Array<{
      name: string;
      agent?: unknown;
    }>;

    expect(hosts.find((h) => h.name === "NAS")?.agent).toBeUndefined();

    // Nor can another server's key be replaced from here.
    const response = await fetch(`${baseUrl}/api/hosts/2/api-key`, {
      method: "POST",
    });
    expect(response.status).toBe(404);

    // Nor read: that key never leaves this process.
    const read = await fetch(`${baseUrl}/api/hosts/2/api-key`);
    expect(read.status).toBe(404);
    expect(await read.text()).not.toContain("their-key");

    db.prepare("DELETE FROM hosts WHERE id != 1").run();
  });
});
