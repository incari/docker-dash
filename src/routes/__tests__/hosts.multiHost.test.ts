/**
 * The dashboard reads other servers' Docker daemons directly.
 *
 * This is the part of multi-host that cannot be checked by reading the code:
 * that each container is labelled with the server it came from, that a server
 * which is down costs only its own containers, that a start/stop is sent to the
 * machine the container actually runs on, and that ssh:// really does carry
 * the Docker API through the ssh binary.
 *
 * The remote "daemon" is a small HTTP server answering the handful of Docker
 * API endpoints the dashboard uses, reached through the real dockerode client
 * over tcp:// - or over ssh://, with a fake ssh binary that pipes to it.
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
process.env.SSH_BINARY = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "fixtures/fake-ssh.mjs",
);
process.env.FAKE_SSH_LOG = path.join(tmpDir, "ssh.log");
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

/** What the remote daemon has, and what it was asked to do. */
const remoteList = vi.fn(() => [container("bbb", "nginx")] as unknown[]);
const remoteAction = vi.fn((_id: string, _action: string) => undefined);

let hubUrl: string;
let daemonPort: number;
let hub: ReturnType<ReturnType<typeof express>["listen"]>;
let daemon: ReturnType<ReturnType<typeof express>["listen"]>;

async function listen(
  app: ReturnType<typeof express>,
): Promise<[typeof hub, number]> {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return [server, port];
}

/** The endpoints of the Docker API the dashboard actually calls. */
function fakeDaemon(): ReturnType<typeof express> {
  const app = express();
  const v = "(?:/v[\\d.]+)?";
  app.get(new RegExp(`^${v}/_ping$`), (_req, res) => {
    res.send("OK");
  });
  app.get(new RegExp(`^${v}/version$`), (_req, res) => {
    res.json({ Version: "27.3.1" });
  });
  app.get(new RegExp(`^${v}/containers/json$`), (_req, res) => {
    res.json(remoteList());
  });
  app.get(new RegExp(`^${v}/containers/([^/]+)/json$`), (req, res) => {
    const id = (req.params as Record<string, string>)[0];
    const found = (remoteList() as Array<{ Id: string }>).find(
      (c) => c.Id === id,
    );
    if (found) res.json(found);
    else res.status(404).json({ message: `No such container: ${id}` });
  });
  app.post(
    new RegExp(`^${v}/containers/([^/]+)/(start|stop|restart)$`),
    (req, res) => {
      const params = req.params as Record<string, string>;
      remoteAction(params[0] as string, params[1] as string);
      res.status(204).end();
    },
  );
  return app;
}

beforeAll(async () => {
  initializeSchema();

  [daemon, daemonPort] = await listen(fakeDaemon());
  process.env.FAKE_DOCKER_PORT = String(daemonPort);

  // The hub: the dashboard the browser talks to.
  const hubApp = express();
  hubApp.use(express.json());
  hubApp.use(hostsRouter);
  hubApp.use(containersRouter);
  hubApp.use(shortcutsRouter);
  const [hubServer, hubPort] = await listen(hubApp);
  hub = hubServer;
  hubUrl = `http://127.0.0.1:${hubPort}`;
});

afterAll(() => {
  hub?.close();
  daemon?.close();
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
  remoteList.mockImplementation(() => [container("bbb", "nginx")]);
  remoteAction.mockClear();
});

/** Nothing listens here: a server that is switched off. */
const DEAD = "tcp://127.0.0.1:49517";

const tcpUrl = () => `tcp://127.0.0.1:${daemonPort}`;

function addHost(name: string, url: string): number {
  const result = db
    .prepare(
      `INSERT INTO hosts (name, type, url, position, enabled)
       VALUES (?, 'docker', ?, 1, 1)`,
    )
    .run(name, url);
  invalidateContainerCache();
  return Number(result.lastInsertRowid);
}

async function statusOf(name: string) {
  const hosts = (await (await fetch(`${hubUrl}/api/hosts`)).json()) as Array<{
    id: number;
    name: string;
    status: {
      online: boolean;
      checked_at: string | null;
      error: string | null;
      error_code: string | null;
      failures: number;
      retry_after: string | null;
    };
  }>;
  return hosts.find((h) => h.name === name)!;
}

describe("GET /api/containers across servers", () => {
  it("labels every container with the server it came from", async () => {
    addHost("NAS", tcpUrl());

    const response = await fetch(`${hubUrl}/api/containers`);
    const body = (await response.json()) as Array<{
      id: string;
      name: string;
      hostId: number;
      hostName: string;
    }>;

    expect(body).toHaveLength(2);
    expect(body.map((c) => `${c.hostName}:${c.id}`).sort()).toEqual([
      "Local:aaa",
      "NAS:bbb",
    ]);
    // Same container name on two servers, told apart by the host.
    expect(new Set(body.map((c) => c.hostId)).size).toBe(2);
  });

  it("reads a server over ssh, through the ssh binary", async () => {
    fs.rmSync(process.env.FAKE_SSH_LOG as string, { force: true });
    addHost("Pi", "ssh://pi@raspberry:2222");

    const body = (await (await fetch(`${hubUrl}/api/containers`)).json()) as Array<{
      id: string;
      hostName: string;
    }>;

    expect(body.find((c) => c.hostName === "Pi")?.id).toBe("bbb");

    // What the remote machine was asked to run, and as whom.
    const args = JSON.parse(
      fs.readFileSync(process.env.FAKE_SSH_LOG as string, "utf8").split("\n")[0] as string,
    ) as string[];
    expect(args).toEqual(expect.arrayContaining(["-p", "2222", "-l", "pi", "-o", "BatchMode=yes"]));
    expect(args.slice(-5)).toEqual(["--", "raspberry", "docker", "system", "dial-stdio"]);
  });

  it("says what ssh complained about", async () => {
    addHost("Denied", "ssh://me@denied");
    addHost("Unknown", "ssh://unknownkey");
    addHost("NoCli", "ssh://nodocker");

    await fetch(`${hubUrl}/api/containers`);

    expect((await statusOf("Denied")).status.error_code).toBe("ssh_auth");
    expect((await statusOf("Unknown")).status.error_code).toBe("ssh_host_key");
    expect((await statusOf("NoCli")).status.error_code).toBe("no_docker_cli");
  });

  it("keeps the other servers' containers when one is unreachable", async () => {
    addHost("Dead", DEAD);

    const response = await fetch(`${hubUrl}/api/containers`);
    const body = (await response.json()) as Array<{ hostName: string }>;

    expect(body.map((c) => c.hostName)).toEqual(["Local"]);

    const dead = await statusOf("Dead");
    expect(dead.status.online).toBe(false);
    expect(dead.status.error_code).toBe("refused");
  });

  it("tells a server still pointing at the old agent apart from one that is down", async () => {
    addHost("Old", "http://nas.local:3080");

    await fetch(`${hubUrl}/api/containers`);

    expect((await statusOf("Old")).status.error_code).toBe("legacy_agent");
  });
});

describe("container actions", () => {
  it("runs the action on the server the container belongs to", async () => {
    const hostId = addHost("NAS", tcpUrl());

    const response = await fetch(
      `${hubUrl}/api/hosts/${hostId}/containers/bbb/restart`,
      { method: "POST" },
    );

    expect(response.status).toBe(200);
    expect(remoteAction).toHaveBeenCalledWith("bbb", "restart");
    expect(startContainer).not.toHaveBeenCalled();
  });

  it("finds the server from the container alone on the older route", async () => {
    addHost("NAS", tcpUrl());
    await fetch(`${hubUrl}/api/containers`);

    const response = await fetch(`${hubUrl}/api/containers/bbb/stop`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(remoteAction).toHaveBeenCalledWith("bbb", "stop");
  });

  it("answers 404 for a container that server does not have", async () => {
    const hostId = addHost("NAS", tcpUrl());

    const response = await fetch(
      `${hubUrl}/api/hosts/${hostId}/containers/zzz/start`,
      { method: "POST" },
    );

    expect(response.status).toBe(404);
    expect(remoteAction).not.toHaveBeenCalled();
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
  async function create(url: string) {
    const response = await fetch(`${hubUrl}/api/hosts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "NAS", url }),
    });
    return {
      status: response.status,
      body: (await response.json()) as {
        url: string;
        hostname: string;
        error_code?: string;
      },
    };
  }

  it("stores ssh and tcp addresses in one canonical form", async () => {
    expect((await create("ssh://me@nas.local/")).body.url).toBe("ssh://me@nas.local");
    expect((await create("tcp://nas.local")).body.url).toBe("tcp://nas.local:2375");
    // "machine:port" is what people type for a proxy.
    const bare = await create("nas.local:2375");
    expect(bare.body.url).toBe("tcp://nas.local:2375");
    // Port links on that server open the server itself, not this one.
    expect(bare.body.hostname).toBe("nas.local");
  });

  it("turns away the old agent's http:// address, and says why", async () => {
    const { status, body } = await create("http://nas.local:3080");
    expect(status).toBe(400);
    expect(body.error_code).toBe("legacy_agent");
  });

  it("turns away an address with no transport", async () => {
    const { status, body } = await create("nas.local");
    expect(status).toBe(400);
    expect(body.error_code).toBe("bad_url");
  });

  it("tests an address before it is saved", async () => {
    const response = await fetch(`${hubUrl}/api/hosts/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: tcpUrl() }),
    });

    expect(await response.json()).toEqual({
      ok: true,
      containers: 1,
      version: "27.3.1",
    });
  });

  it("will not delete the local server", async () => {
    const response = await fetch(`${hubUrl}/api/hosts/1`, { method: "DELETE" });
    expect(response.status).toBe(400);
  });

  it("takes a server's shortcuts with it when it is removed", async () => {
    const hostId = addHost("NAS", tcpUrl());
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
    // Both servers run a container called nginx, which is exactly the awkward
    // case: identical names on two machines.
    const hostId = addHost("NAS", tcpUrl());

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
    const hostId = addHost("NAS", tcpUrl());
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
  it("stops reading a failing server until its backoff expires", async () => {
    addHost("Dead", DEAD);

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
    const hostId = addHost("Dead", DEAD);

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
    const hostId = addHost("Flaky", DEAD);

    await fetch(`${hubUrl}/api/containers`);
    expect((await statusOf("Flaky")).status.failures).toBe(1);

    // The server comes back: point the host at the daemon that is actually up.
    db.prepare("UPDATE hosts SET url = ? WHERE id = ?").run(tcpUrl(), hostId);
    invalidateContainerCache();

    await fetch(`${hubUrl}/api/hosts/${hostId}/retry`, { method: "POST" });

    const recovered = await statusOf("Flaky");
    expect(recovered.status.online).toBe(true);
    expect(recovered.status.failures).toBe(0);
    expect(recovered.status.retry_after).toBeNull();
  });
});
