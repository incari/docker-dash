/**
 * The hub reads other servers over HTTP.
 *
 * This is the part of multi-host that cannot be checked by reading the code:
 * that an agent refuses a request without its key, that the hub labels each
 * container with the server it came from, that a server which is down costs
 * only its own containers, and that a start/stop is sent to the machine the
 * container actually runs on.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dockerdash-hosts-test-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");
process.env.API_KEY = "s3cret-key";
// Keep a dead host from holding the suite up for the default six seconds.
process.env.HOST_TIMEOUT_MS = "800";
process.env.HOST_CACHE_MS = "0";
// These exercise what a sweep does, not how often it is allowed to run, so the
// throttle is off here. autoSyncThrottle.test.ts covers the throttle itself.
process.env.AUTO_SYNC_INTERVAL_MS = "0";

const listContainers = vi.fn(async () => [] as unknown[]);
const startContainer = vi.fn(async () => undefined);
const inspectContainer = vi.fn(async () => ({}));

vi.mock("../../config/docker.js", () => ({
  docker: {
    listContainers: (...a: unknown[]) => listContainers(...(a as [])),
    getContainer: (id: string) => ({
      id,
      inspect: () => inspectContainer(),
      start: () => startContainer(),
      stop: async () => undefined,
      restart: async () => undefined,
    }),
  },
}));

vi.mock("../../utils/dockerIconVault.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // Network lookups would make these tests flaky.
    getValidatedIconUrl: vi.fn(async () => "Server"),
    urlExists: vi.fn(async () => false),
  };
});

const { db, initializeSchema } = await import("../../config/database.js");
const { default: agentRouter } = await import("../agent.js");
const { default: containersRouter } = await import("../containers.js");
const { default: hostsRouter } = await import("../hosts.js");
const { default: shortcutsRouter } = await import("../shortcuts.js");
const { invalidateContainerCache } = await import("../../hosts/client.js");
const express = (await import("express")).default;

function container(id: string, name: string) {
  return {
    Id: id,
    Names: [`/${name}`],
    Image: "nginx:latest",
    State: "running",
    Status: "Up 2 hours",
    Labels: {},
    Ports: [{ PrivatePort: 80, PublicPort: 8080, Type: "tcp" }],
  };
}

let hubUrl: string;
let agentUrl: string;
let hub: ReturnType<ReturnType<typeof express>["listen"]>;
let agent: ReturnType<ReturnType<typeof express>["listen"]>;

async function listen(app: ReturnType<typeof express>): Promise<[typeof hub, string]> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return [server, `http://127.0.0.1:${port}`];
}

beforeAll(async () => {
  initializeSchema();

  // The agent: this machine's Docker daemon, served to whoever holds the key.
  const agentApp = express();
  agentApp.use(express.json());
  agentApp.use(agentRouter);
  [agent, agentUrl] = await listen(agentApp);

  // The hub: the dashboard the browser talks to.
  const hubApp = express();
  hubApp.use(express.json());
  hubApp.use(hostsRouter);
  hubApp.use(containersRouter);
  hubApp.use(shortcutsRouter);
  [hub, hubUrl] = await listen(hubApp);
});

afterAll(() => {
  hub?.close();
  agent?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec("DELETE FROM shortcuts");
  db.exec("DELETE FROM dismissed_containers");
  db.exec("DELETE FROM hosts WHERE id != 1");
  db.exec("UPDATE hosts SET name = 'Local' WHERE id = 1");
  invalidateContainerCache();
  listContainers.mockResolvedValue([container("aaa", "nginx")]);
  startContainer.mockClear();
});

function addAgentHost(name: string, url: string, apiKey: string): number {
  const result = db
    .prepare(
      `INSERT INTO hosts (name, type, url, api_key, position, enabled)
       VALUES (?, 'agent', ?, ?, 1, 1)`,
    )
    .run(name, url, apiKey);
  invalidateContainerCache();
  return Number(result.lastInsertRowid);
}

describe("agent endpoints", () => {
  it("refuses a request with no key", async () => {
    const response = await fetch(`${agentUrl}/api/agent/containers`);
    expect(response.status).toBe(401);
  });

  it("refuses a request with the wrong key", async () => {
    const response = await fetch(`${agentUrl}/api/agent/containers`, {
      headers: { Authorization: "Bearer not-the-key" },
    });
    expect(response.status).toBe(401);
  });

  it("serves containers to a caller holding the key", async () => {
    const response = await fetch(`${agentUrl}/api/agent/containers`, {
      headers: { Authorization: "Bearer s3cret-key" },
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as Array<{ name: string }>;
    expect(body.map((c) => c.name)).toEqual(["nginx"]);
  });
});

describe("GET /api/containers across servers", () => {
  it("labels every container with the server it came from", async () => {
    addAgentHost("NAS", agentUrl, "s3cret-key");

    const response = await fetch(`${hubUrl}/api/containers`);
    const body = (await response.json()) as Array<{
      name: string;
      hostId: number;
      hostName: string;
    }>;

    expect(body).toHaveLength(2);
    expect(body.map((c) => c.hostName).sort()).toEqual(["Local", "NAS"]);
    // Same container name on two servers, told apart by the host.
    expect(new Set(body.map((c) => c.hostId)).size).toBe(2);
  });

  it("keeps the other servers' containers when one is unreachable", async () => {
    // Nothing listens on this port: the request fails at connect.
    addAgentHost("Dead", "http://127.0.0.1:49517", "s3cret-key");

    const response = await fetch(`${hubUrl}/api/containers`);
    const body = (await response.json()) as Array<{ hostName: string }>;

    expect(body.map((c) => c.hostName)).toEqual(["Local"]);

    const hosts = (await (await fetch(`${hubUrl}/api/hosts`)).json()) as Array<{
      name: string;
      status: { online: boolean; error: string | null };
    }>;
    const dead = hosts.find((h) => h.name === "Dead");
    expect(dead?.status.online).toBe(false);
    expect(dead?.status.error).toMatch(/refused/i);
  });

  it("rejects a key the agent does not recognise, and says so", async () => {
    addAgentHost("Typo", agentUrl, "wrong-key");

    await fetch(`${hubUrl}/api/containers`);

    const hosts = (await (await fetch(`${hubUrl}/api/hosts`)).json()) as Array<{
      name: string;
      status: { online: boolean; error: string | null };
    }>;
    expect(hosts.find((h) => h.name === "Typo")?.status.error).toMatch(
      /api key/i,
    );
  });

  it("never sends another server's key to the browser", async () => {
    addAgentHost("NAS", agentUrl, "a-remote-servers-key");

    const raw = await (await fetch(`${hubUrl}/api/hosts`)).text();
    const hosts = JSON.parse(raw);

    // A remote server's key is the hub's business, not the browser's.
    expect(raw).not.toContain("a-remote-servers-key");
    expect(hosts[1].has_api_key).toBe(true);

    // This machine's own key is a different matter: it is what the person has
    // to copy into a hub, and this page can already control these containers.
    expect(hosts[0].agent).toMatchObject({
      enabled: true,
      managed_by_env: true,
      api_key: "s3cret-key",
    });
    expect(hosts[1].agent).toBeUndefined();
  });
});

describe("container actions", () => {
  it("runs the action on the server the container belongs to", async () => {
    const hostId = addAgentHost("NAS", agentUrl, "s3cret-key");

    const response = await fetch(
      `${hubUrl}/api/hosts/${hostId}/containers/aaa/start`,
      { method: "POST" },
    );

    expect(response.status).toBe(200);
    // The hub reached the agent, which started it on its own daemon.
    expect(startContainer).toHaveBeenCalledTimes(1);
  });

  it("answers 404 for a server that does not exist", async () => {
    const response = await fetch(
      `${hubUrl}/api/hosts/999/containers/aaa/start`,
      { method: "POST" },
    );

    expect(response.status).toBe(404);
    expect(startContainer).not.toHaveBeenCalled();
  });

  it("refuses an action that is not start, stop or restart", async () => {
    const response = await fetch(
      `${hubUrl}/api/hosts/1/containers/aaa/destroy`,
      { method: "POST" },
    );

    expect(response.status).toBe(400);
  });
});

describe("POST /api/hosts", () => {
  it("requires a name, an address and a key", async () => {
    const response = await fetch(`${hubUrl}/api/hosts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "NAS", url: agentUrl }),
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(
      /api key/i,
    );
  });

  it("accepts an address without a scheme", async () => {
    const response = await fetch(`${hubUrl}/api/hosts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "NAS",
        url: "nas.local:3080",
        api_key: "abc",
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { url: string; hostname: string };
    expect(body.url).toBe("http://nas.local:3080");
    // Port links on that server open the server itself, not the hub.
    expect(body.hostname).toBe("nas.local");
  });

  it("will not delete the local server", async () => {
    const response = await fetch(`${hubUrl}/api/hosts/1`, { method: "DELETE" });
    expect(response.status).toBe(400);
  });

  it("takes a server's shortcuts with it when it is removed", async () => {
    const hostId = addAgentHost("NAS", agentUrl, "s3cret-key");
    db.prepare(
      "INSERT INTO shortcuts (host_id, display_name) VALUES (?, 'Plex')",
    ).run(hostId);

    const response = await fetch(`${hubUrl}/api/hosts/${hostId}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(200);
    expect(
      db
        .prepare("SELECT COUNT(*) as n FROM shortcuts WHERE host_id = ?")
        .get(hostId),
    ).toEqual({ n: 0 });
  });
});

describe("auto-sync across servers", () => {
  it("gives the same container name on two servers a shortcut each", async () => {
    // Both servers are backed by the same mocked daemon here, which is exactly
    // the awkward case: identical container names on two machines.
    const hostId = addAgentHost("NAS", agentUrl, "s3cret-key");

    const response = await fetch(`${hubUrl}/api/shortcuts/auto-sync`, {
      method: "POST",
    });
    expect(response.status).toBe(200);

    const rows = db
      .prepare(
        "SELECT host_id, display_name FROM shortcuts ORDER BY host_id ASC",
      )
      .all() as Array<{ host_id: number; display_name: string }>;

    expect(rows).toEqual([
      { host_id: 1, display_name: "nginx" },
      { host_id: hostId, display_name: "nginx" },
    ]);
  });

  it("keeps a dismissal on the server it was made on", async () => {
    const hostId = addAgentHost("NAS", agentUrl, "s3cret-key");
    await fetch(`${hubUrl}/api/shortcuts/auto-sync`, { method: "POST" });

    const local = db
      .prepare("SELECT id FROM shortcuts WHERE host_id = 1")
      .get() as { id: number };

    // Deleting the local tile means "not on this machine", not "nowhere".
    await fetch(`${hubUrl}/api/shortcuts/${local.id}`, { method: "DELETE" });
    invalidateContainerCache();
    await fetch(`${hubUrl}/api/shortcuts/auto-sync`, { method: "POST" });

    const hostIds = (
      db
        .prepare("SELECT host_id FROM shortcuts ORDER BY host_id ASC")
        .all() as Array<{ host_id: number }>
    ).map((row) => row.host_id);

    expect(hostIds).toEqual([hostId]);
  });
});

describe("backing off a server that keeps failing", () => {
  async function statusOf(name: string) {
    const hosts = (await (await fetch(`${hubUrl}/api/hosts`)).json()) as Array<{
      id: number;
      name: string;
      status: {
        online: boolean;
        checked_at: string | null;
        failures: number;
        retry_after: string | null;
      };
    }>;
    return hosts.find((h) => h.name === name)!;
  }

  it("stops reading a failing server until its backoff expires", async () => {
    addAgentHost("Dead", "http://127.0.0.1:49517", "s3cret-key");

    await fetch(`${hubUrl}/api/containers`);
    const first = await statusOf("Dead");

    expect(first.status.failures).toBe(1);
    expect(Date.parse(first.status.retry_after!)).toBeGreaterThan(Date.now());

    // The next read skips it entirely, which is the point: a server that is
    // asleep rather than refusing costs the full request timeout every time.
    await fetch(`${hubUrl}/api/containers`);
    const second = await statusOf("Dead");

    expect(second.status.checked_at).toBe(first.status.checked_at);
    expect(second.status.failures).toBe(1);
  });

  it("never skips the local server, which costs nothing to read", async () => {
    // Its socket is mocked and always answers, so it is simply never backed off.
    await fetch(`${hubUrl}/api/containers`);
    const local = await statusOf("Local");

    expect(local.status.online).toBe(true);
    expect(local.status.retry_after).toBeNull();
  });

  it("tries again at once when asked to", async () => {
    const hostId = addAgentHost("Dead", "http://127.0.0.1:49517", "s3cret-key");

    await fetch(`${hubUrl}/api/containers`);
    const skipped = await statusOf("Dead");

    const response = await fetch(`${hubUrl}/api/hosts/${hostId}/retry`, {
      method: "POST",
    });
    expect(response.status).toBe(200);

    const retried = await statusOf("Dead");
    expect(retried.status.checked_at).not.toBe(skipped.status.checked_at);
  });

  it("forgets the backoff as soon as the server answers again", async () => {
    const hostId = addAgentHost("Flaky", "http://127.0.0.1:49517", "s3cret-key");

    await fetch(`${hubUrl}/api/containers`);
    expect((await statusOf("Flaky")).status.failures).toBe(1);

    // The server comes back: point the host at the agent that is actually up.
    db.prepare("UPDATE hosts SET url = ? WHERE id = ?").run(agentUrl, hostId);
    invalidateContainerCache();

    await fetch(`${hubUrl}/api/hosts/${hostId}/retry`, { method: "POST" });

    const recovered = await statusOf("Flaky");
    expect(recovered.status.online).toBe(true);
    expect(recovered.status.failures).toBe(0);
    expect(recovered.status.retry_after).toBeNull();
  });
});
